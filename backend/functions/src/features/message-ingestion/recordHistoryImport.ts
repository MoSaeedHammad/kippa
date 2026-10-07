import { randomBytes } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { Account, ImportMessageHistoryResult, PendingFinancialMessage } from '@kippa/domain';
import {
  recordReceiptKey,
  sanitizeHistoryRecords,
  type SanitizedHistoryRecord,
} from '../../domain/message-ingestion/historyRecords.js';
import { withinRange } from '../../domain/message-ingestion/historyImport.js';
import {
  assertString,
} from './messageIngestion.js';
import { BATCH_ID_PATTERN, commitChunk } from './messageHistoryImport.js';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

/**
 * Stages structured records (a personal JSON export of expenses, incomes and
 * transfers) as pending financial messages, so they flow through the exact
 * same review pipeline as ingested bank messages: per-item approval with
 * account/category suggestions, and bulk approve-all / cancel-all per import
 * batch. Re-importing the same records is a no-op (receipt dedupe).
 */
export const importRecordHistory = onCall(
  { timeoutSeconds: 540 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const data = request.data as {
      householdId?: unknown;
      records?: unknown;
      batchId?: unknown;
      from?: unknown;
      to?: unknown;
    };
    const householdId = assertString(data.householdId, 'householdId');
    const profile = await requireFullHouseholdMember(uid, householdId);

    let records: SanitizedHistoryRecord[];
    try {
      records = sanitizeHistoryRecords(data.records);
    } catch {
      throw new HttpsError('invalid-argument', 'records must be an array.');
    }
    if (records.length === 0) {
      throw new HttpsError('invalid-argument', 'No importable records were provided.');
    }

    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof data.from === 'string' && isoDate.test(data.from) ? data.from : null;
    const to = typeof data.to === 'string' && isoDate.test(data.to) ? data.to : null;
    const batchId = typeof data.batchId === 'string' && BATCH_ID_PATTERN.test(data.batchId)
      ? data.batchId
      : `his_${randomBytes(8).toString('hex')}`;

    const db = getFirestore();
    const now = new Date().toISOString();
    const accountsSnapshot = await db.collection(`households/${householdId}/accounts`).get();
    const accounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Account);

    // Records usually carry their own account; when they do not, fall back
    // to the single active running account — the same default the message
    // parser uses — so bulk approval can resolve them.
    const runningAccounts = accounts.filter((account) => account.isActive && account.type === 'running');
    const fallbackAccountId = runningAccounts.length === 1 ? runningAccounts[0].id : null;

    let staged = 0;
    let duplicates = 0;
    let outOfRange = 0;

    type CreatedPending = { receiptId: string; pending: PendingFinancialMessage };
    const created: CreatedPending[] = [];
    const seen = new Set<string>();
    for (const record of records) {
      if (from || to && !withinRange(record.date, from, to)) {
        outOfRange++;
        continue;
      }
      const receiptId = recordReceiptKey(householdId, record.canonical);
      if (seen.has(receiptId)) continue;
      seen.add(receiptId);

      const previewParts = [record.description ?? `${record.kind} record`, `${record.amount} ${record.currency}`, record.date];
      const pending: PendingFinancialMessage = {
        id: receiptId,
        householdId,
        receivedBy: uid,
        kind: record.kind,
        source: 'import-json',
        provider: 'manual',
        amount: record.amount,
        currency: record.currency,
        date: record.date,
        description: record.description ?? `${record.kind === 'income' ? 'Received' : record.kind === 'transfer' ? 'Transferred' : 'Spent'} ${record.amount} ${record.currency}`,
        counterparty: record.counterparty,
        messagePreview: previewParts.join(' · '),
        accountHintLast4: null,
        destinationHintLast4: null,
        suggestedAccountId: record.accountId ?? fallbackAccountId,
        suggestedDestinationAccountId: record.destinationAccountId,
        suggestedLoanId: null,
        suggestedLoanName: null,
        suggestedLoanInstallmentNumber: null,
        suggestedCategoryId: record.categoryId,
        conversionRequired: null,
        destinationAmount: null,
        destinationCurrency: null,
        transferLeg: null,
        mergeKey: null,
        importBatchId: batchId,
        importedAt: now,
        createdAt: now,
        status: 'pending',
      };
      created.push({ receiptId, pending });
    }

    // Pre-check existing receipts so re-imports count as duplicates instead
    // of failing batch.create, then write in chunks of 200.
    const receiptRefs = created.map((entry) => db.doc(`messageIngestionReceipts/${entry.receiptId}`));
    const existing = receiptRefs.length > 0 ? await db.getAll(...receiptRefs) : [];
    const existingIds = new Set(existing.filter((snap) => snap.exists).map((snap) => snap.id));
    const fresh = created.filter((entry) => {
      if (existingIds.has(entry.receiptId)) {
        duplicates++;
        return false;
      }
      return true;
    });

    for (let index = 0; index < fresh.length; index += 200) {
      const chunk = fresh.slice(index, index + 200);
      await commitChunk(db, householdId, chunk, [], [], now, {
        onDuplicate: () => duplicates++,
        onStage: () => staged++,
      });
    }

    const auditId = `record_import_${batchId}_${Date.now()}`;
    await db.doc(`households/${householdId}/auditLog/${auditId}`).create({
      id: auditId,
      householdId,
      userId: uid,
      userDisplayName: profile.displayName || 'User',
      userPhotoURL: profile.photoURL ?? null,
      action: 'record_history_imported',
      summary: `${profile.displayName || 'User'} imported ${staged} record${staged === 1 ? '' : 's'} from JSON history`
        + (from || to ? ` (${from ?? '…'} → ${to ?? '…'})` : ''),
      details: { batchId, staged, duplicates, ignored: outOfRange },
      createdAt: now,
    });

    return {
      batchId,
      received: records.length,
      staged,
      duplicates,
      ignored: outOfRange,
      unsupported: 0,
      merged: 0,
    } satisfies ImportMessageHistoryResult;
  },
);
