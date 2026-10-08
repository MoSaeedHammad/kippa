import { randomBytes } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentReference } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import type {
  Account,
  Card,
  DecideImportBatchResult,
  FinanceTransaction,
  ImportMessageHistoryResult,
  Loan,
  PendingFinancialMessage,
} from '@kippa/domain';
import { buildMessagePreview, isIgnoredFinancialMessage, parseFinancialMessage } from '../../domain/message-ingestion/parser.js';
import {
  chunksOf,
  importReceiptKey,
  sanitizeHistoryMessages,
  stampToDate,
  withinRange,
} from '../../domain/message-ingestion/historyImport.js';
import { buildMergedTransferLeg } from '../../domain/message-ingestion/transferLegs.js';
import { matchLoanSuggestion } from '../../domain/message-ingestion/loanSuggestion.js';
import { pickSuggestions } from '../../domain/message-ingestion/suggestions.js';
import { matchCategoryByPattern } from '../../domain/categories/categoryMatching.js';
import {
  approvePendingFinancialMessage,
  assertString,
  cleanSource,
  discardPendingFinancialMessage,
} from './messageIngestion.js';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';
import { matchMessageTemplates } from '../../domain/message-ingestion/messageTemplates.js';
import type { MessageTemplate } from '@kippa/domain';

type IngestionReceipt = {
  id: string;
  credentialId: string;
  householdId: string;
  state: 'pending' | 'approved' | 'discarded' | 'ignored';
  pendingId?: string;
  transactionId?: string;
  snapshot?: PendingFinancialMessage;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedByDisplayName?: string;
  createdAt: string;
  updatedAt: string;
};

/** v2 callables expose `.run()` at runtime; reuse it so bulk decisions go through the exact per-item logic. */
type RunnableCallable = { run(request: CallableRequest<unknown>): Promise<unknown> };

function runCallable(fn: object, uid: string, data: unknown): Promise<unknown> {
  return (fn as unknown as RunnableCallable).run({ auth: { uid }, data } as CallableRequest<unknown>);
}

export const BATCH_ID_PATTERN = /^his_[a-z0-9]{6,40}$/;
const MESSAGES_PER_CALL = 200;
/** Firestore batches cap at 500 writes; each staged message uses two. */
const OPS_PER_BATCH_COMMIT = 480;

/**
 * Stages messages extracted client-side from a phone history export as
 * pending financial messages. Runs the same parser, suggestions, loan
 * matcher, transfer-leg merge and receipt dedupe as the live webhook, minus
 * push notifications (an import of hundreds of messages must not spam the
 * household). Re-importing the same file is a no-op thanks to the receipts.
 */
export const importMessageHistory = onCall(
  { timeoutSeconds: 540 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const data = request.data as {
      householdId?: unknown;
      messages?: unknown;
      batchId?: unknown;
      from?: unknown;
      to?: unknown;
      source?: unknown;
    };
    const householdId = assertString(data.householdId, 'householdId');
    const profile = await requireFullHouseholdMember(uid, householdId);

    let messages;
    try {
      messages = sanitizeHistoryMessages(data.messages);
    } catch {
      throw new HttpsError('invalid-argument', 'messages must be an array.');
    }
    if (messages.length === 0) {
      throw new HttpsError('invalid-argument', 'No importable messages were provided.');
    }

    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const from = typeof data.from === 'string' && isoDate.test(data.from) ? data.from : null;
    const to = typeof data.to === 'string' && isoDate.test(data.to) ? data.to : null;
    const batchId = typeof data.batchId === 'string' && BATCH_ID_PATTERN.test(data.batchId)
      ? data.batchId
      : `his_${randomBytes(8).toString('hex')}`;
    const source = cleanSource(typeof data.source === 'string' && data.source.trim() ? data.source : 'import');

    const db = getFirestore();
    // Everything suggestion-related is loaded once per call — the per-message
    // loaders used by the webhook would re-scan collections per message.
    const [accountsSnapshot, cardsSnapshot, loansSnapshot, transactionsSnapshot, categoryRulesSnapshot, templatesSnapshot] = await Promise.all([
      db.collection(`households/${householdId}/accounts`).get(),
      db.collection(`households/${householdId}/cards`).get(),
      db.collection(`households/${householdId}/loans`).get(),
      db.collection(`households/${householdId}/transactions`).get(),
      db.collection(`households/${householdId}/categoryRules`).get(),
      db.collection(`households/${householdId}/messageTemplates`).where('isActive', '==', true).get(),
    ]);
    const accounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Account);
    const cards = cardsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Card);
    const loans = loansSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Loan);
    const transactions = transactionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as FinanceTransaction);
    const categoryRules = categoryRulesSnapshot.docs.map((doc) => ({ ...doc.data() }) as { pattern: string; categoryId: string });
    const templates = templatesSnapshot.docs.map((doc) => ({ ...(doc.data() as MessageTemplate), id: doc.id }));
    const overrideTemplates = templates.filter((template) => template.overrideBuiltIn === true);
    const todayIso = new Date().toISOString().slice(0, 10);

    let staged = 0;
    let duplicates = 0;
    let ignored = 0;
    let unsupported = 0;
    let mergedLegs = 0;
    const now = new Date().toISOString();

    type CreatedPending = { receiptId: string; pending: PendingFinancialMessage };
    for (const chunk of chunksOf(messages, MESSAGES_PER_CALL)) {
      // Dedupe inside the chunk and against existing receipts before parsing,
      // so re-imported or already-forwarded messages never reach the parser.
      const receiptIds = new Map<string, string>();
      for (const message of chunk) {
        const receiptId = importReceiptKey(householdId, message.text);
        if (receiptIds.has(receiptId)) duplicates++;
        else receiptIds.set(receiptId, receiptId);
      }
      const receiptRefs = [...receiptIds.values()].map((id) => db.doc(`messageIngestionReceipts/${id}`));
      const existing = await db.getAll(...receiptRefs);
      for (const receiptSnapshot of existing) {
        if (receiptSnapshot.exists) {
          receiptIds.delete(receiptSnapshot.id);
          duplicates++;
        }
      }
      const freshIds = new Set(receiptIds.values());

      const created: CreatedPending[] = [];
      const ignoredReceipts: { receiptId: string; pendingId: string }[] = [];
      const docMerges: { pendingRef: DocumentReference; fields: Partial<PendingFinancialMessage> }[] = [];
      /** Legs staged in this same chunk, by mergeKey, for in-memory pairing. */
      const legs = new Map<string, CreatedPending>();

      for (const message of chunk) {
        const receiptId = importReceiptKey(householdId, message.text);
        if (!freshIds.has(receiptId)) continue;

        let templateMatch: ReturnType<typeof matchMessageTemplates> = null;
        // Overriding rules run before the built-in bank regexes (noise is
        // filtered first); other templates rescue unsupported messages.
        if (!isIgnoredFinancialMessage(message.text)) {
          templateMatch = matchMessageTemplates(message.text, overrideTemplates, todayIso);
        }
        let parsedResult = templateMatch
          ? ({ outcome: 'matched', parsed: templateMatch.parsed } as ReturnType<typeof parseFinancialMessage>)
          : parseFinancialMessage(message.text, source, message.sender);
        if (!templateMatch && parsedResult.outcome === 'unsupported') {
          templateMatch = matchMessageTemplates(message.text, templates, todayIso);
          if (templateMatch) parsedResult = { outcome: 'matched', parsed: templateMatch.parsed };
        }
        if (parsedResult.outcome === 'notification' || parsedResult.outcome === 'ignored') {
          ignored++;
          continue;
        }
        if (parsedResult.outcome !== 'matched') {
          unsupported++;
          continue;
        }
        const parsed = parsedResult.parsed;
        // The export carries the real SMS date; trust it over body parsing.
        // Stamped messages outside the requested duration are dropped here so
        // the client's range filter is enforced server-side too.
        const stampDate = stampToDate(message.dateMs);
        if (stampDate) {
          parsed.date = stampDate;
          if (!withinRange(parsed.date, from, to)) continue;
        }

        const suggestions = pickSuggestions(accounts, cards, parsed);
        const loanSuggestion = matchLoanSuggestion(loans, transactions, parsed, suggestions.accountId);

        // Two-message cross-currency transfers: merge the arriving leg into
        // the opposite half-pending from this chunk, an earlier chunk, or
        // live ingestion — identical to the webhook behavior.
        if (parsed.transferLeg && parsed.mergeKey) {
          const oppositeLeg = parsed.transferLeg === 'debit' ? 'credit' : 'debit';
          const inCallLeg = legs.get(parsed.mergeKey) ?? null;
          let half = inCallLeg?.pending ?? null;
          if (!half) {
            const halfSnapshot = await db.collection(`households/${householdId}/pendingFinancialMessages`)
              .where('mergeKey', '==', parsed.mergeKey)
              .where('transferLeg', '==', oppositeLeg)
              .where('date', '==', parsed.date)
              .where('status', '==', 'pending')
              .limit(1)
              .get();
            half = halfSnapshot.empty ? null : halfSnapshot.docs[0].data() as PendingFinancialMessage;
          }
          if (half) {
            const mergedFields = buildMergedTransferLeg({
              arriving: parsed,
              half,
              arrivingPreview: buildMessagePreview(message.text),
              accounts,
              cards,
            });
            if (inCallLeg) {
              // Both legs in this chunk: fold the merge into the
              // not-yet-written doc and drop the half from the pair map.
              Object.assign(inCallLeg.pending, mergedFields);
              legs.delete(parsed.mergeKey);
            } else {
              docMerges.push({
                pendingRef: db.doc(`households/${householdId}/pendingFinancialMessages/${half.id}`),
                fields: mergedFields,
              });
            }
            ignoredReceipts.push({ receiptId, pendingId: half.id });
            mergedLegs++;
            continue;
          }
        }

        const pending: PendingFinancialMessage = {
          id: receiptId,
          householdId,
          receivedBy: uid,
          kind: parsed.kind,
          source,
          provider: parsed.provider,
          amount: parsed.amount,
          currency: parsed.currency,
          date: parsed.date,
          description: loanSuggestion ? `${loanSuggestion.loanName} — installment ${loanSuggestion.installmentNumber}` : parsed.description,
          counterparty: parsed.counterparty ?? null,
          messagePreview: buildMessagePreview(message.text),
          sourceMessage: message.text,
          accountHintLast4: parsed.accountHintLast4 ?? null,
          destinationHintLast4: parsed.destinationHintLast4 ?? null,
          suggestedAccountId: suggestions.accountId ?? null,
          suggestedDestinationAccountId: suggestions.destinationAccountId ?? null,
          suggestedAccountProposal: suggestions.accountProposal ?? null,
          matchedTemplateId: templateMatch?.templateId ?? null,
          matchedTemplateName: templateMatch?.templateName ?? null,
          suggestedLoanId: loanSuggestion?.loanId ?? null,
          suggestedLoanName: loanSuggestion?.loanName ?? null,
          suggestedLoanInstallmentNumber: loanSuggestion?.installmentNumber ?? null,
          suggestedCategoryId: parsed.kind === 'transfer'
            ? null
            : matchCategoryByPattern(categoryRules, { description: parsed.description, counterparty: parsed.counterparty ?? null }),
          conversionRequired: suggestions.conversionRequired || null,
          destinationAmount: null,
          destinationCurrency: null,
          transferLeg: parsed.transferLeg ?? null,
          mergeKey: parsed.mergeKey ?? null,
          importBatchId: batchId,
          importedAt: now,
          createdAt: now,
          status: 'pending',
        };
        const entry: CreatedPending = { receiptId, pending };
        created.push(entry);
        if (parsed.transferLeg && parsed.mergeKey) legs.set(parsed.mergeKey, entry);
      }

      await commitChunk(db, householdId, created, ignoredReceipts, docMerges, now, {
        onDuplicate: () => duplicates++,
        onStage: () => staged++,
      });
    }

    const auditId = `history_import_${batchId}_${Date.now()}`;
    await db.doc(`households/${householdId}/auditLog/${auditId}`).create({
      id: auditId,
      householdId,
      userId: uid,
      userDisplayName: profile.displayName || 'User',
      userPhotoURL: profile.photoURL ?? null,
      action: 'message_history_imported',
      summary: `${profile.displayName || 'User'} imported ${staged} bank message${staged === 1 ? '' : 's'} from phone history`
        + (from || to ? ` (${from ?? '…'} → ${to ?? '…'})` : ''),
      details: { batchId, staged, duplicates, ignored, unsupported, merged: mergedLegs, source },
      createdAt: now,
    });

    return {
      batchId,
      received: messages.length,
      staged,
      duplicates,
      ignored,
      unsupported,
      merged: mergedLegs,
    } satisfies ImportMessageHistoryResult;
  },
);

export async function commitChunk(
  db: ReturnType<typeof getFirestore>,
  householdId: string,
  created: { receiptId: string; pending: PendingFinancialMessage }[],
  ignoredReceipts: { receiptId: string; pendingId: string }[],
  docMerges: { pendingRef: DocumentReference; fields: Partial<PendingFinancialMessage> }[],
  now: string,
  counters: { onDuplicate: () => void; onStage: () => void },
): Promise<void> {
  if (created.length === 0 && ignoredReceipts.length === 0 && docMerges.length === 0) return;
  const credentialId = `history-import_${householdId}`;
  let batch = db.batch();
  let ops = 0;
  let failure: unknown = null;
  try {
    for (const entry of created) {
      const pendingRef = db.doc(`households/${householdId}/pendingFinancialMessages/${entry.receiptId}`);
      const receiptRef = db.doc(`messageIngestionReceipts/${entry.receiptId}`);
      batch.create(pendingRef, entry.pending);
      const receipt: IngestionReceipt = {
        id: entry.receiptId,
        credentialId,
        householdId,
        state: 'pending',
        pendingId: entry.receiptId,
        createdAt: now,
        updatedAt: now,
      };
      batch.create(receiptRef, receipt);
      ops += 2;
      if (ops >= OPS_PER_BATCH_COMMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    for (const ignoredReceipt of ignoredReceipts) {
      batch.create(db.doc(`messageIngestionReceipts/${ignoredReceipt.receiptId}`), {
        id: ignoredReceipt.receiptId,
        credentialId,
        householdId,
        state: 'ignored',
        pendingId: ignoredReceipt.pendingId,
        createdAt: now,
        updatedAt: now,
      } satisfies IngestionReceipt);
      ops += 1;
      if (ops >= OPS_PER_BATCH_COMMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    for (const docMerge of docMerges) {
      batch.set(docMerge.pendingRef, docMerge.fields, { merge: true });
      ops += 1;
      if (ops >= OPS_PER_BATCH_COMMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  } catch (error) {
    // A receipt raced between the pre-check and the commit. Fall back to
    // per-entry writes; each loser is counted as a duplicate.
    failure = error;
    console.warn('history import chunk fell back to per-entry writes', error);
  }
  if (failure == null) {
    created.forEach(() => counters.onStage());
    return;
  }
  for (const entry of created) {
    const single = db.batch();
    single.create(db.doc(`households/${householdId}/pendingFinancialMessages/${entry.receiptId}`), entry.pending);
    single.create(db.doc(`messageIngestionReceipts/${entry.receiptId}`), {
      id: entry.receiptId,
      credentialId,
      householdId,
      state: 'pending',
      pendingId: entry.receiptId,
      createdAt: now,
      updatedAt: now,
    } satisfies IngestionReceipt);
    try {
      await single.commit();
      counters.onStage();
    } catch {
      counters.onDuplicate();
    }
  }
  for (const ignoredReceipt of ignoredReceipts) {
    const single = db.batch();
    single.create(db.doc(`messageIngestionReceipts/${ignoredReceipt.receiptId}`), {
      id: ignoredReceipt.receiptId,
      credentialId,
      householdId,
      state: 'ignored',
      pendingId: ignoredReceipt.pendingId,
      createdAt: now,
      updatedAt: now,
    } satisfies IngestionReceipt);
    try {
      await single.commit();
    } catch {
      counters.onDuplicate();
    }
  }
  for (const docMerge of docMerges) {
    const single = db.batch();
    single.set(docMerge.pendingRef, docMerge.fields, { merge: true });
    try {
      await single.commit();
    } catch {
      counters.onDuplicate();
    }
  }
}

/**
 * Bulk decision for a staged history import. Every item goes through the
 * exact per-item approve/discard handler via `.run()`, so receipts, audit
 * log, loan locks and ledger lines stay consistent with single approvals.
 * Items that cannot be resolved safely are skipped with a reason and remain
 * pending for manual review.
 */
export const decideImportBatch = onCall(
  { timeoutSeconds: 540 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
    const data = request.data as {
      householdId?: unknown;
      batchId?: unknown;
      action?: unknown;
      maxItems?: unknown;
    };
    const householdId = assertString(data.householdId, 'householdId');
    const batchId = assertString(data.batchId, 'batchId');
    if (!BATCH_ID_PATTERN.test(batchId)) {
      throw new HttpsError('invalid-argument', 'batchId is malformed.');
    }
    const action = data.action === 'approve' || data.action === 'discard' ? data.action : null;
    if (!action) throw new HttpsError('invalid-argument', 'action must be "approve" or "discard".');
    const maxItems = typeof data.maxItems === 'number' && Number.isFinite(data.maxItems)
      ? Math.min(300, Math.max(1, Math.floor(data.maxItems)))
      : 100;
    await requireFullHouseholdMember(uid, householdId);

    const db = getFirestore();
    // Equality-only query — no composite index required.
    const snapshot = await db.collection(`households/${householdId}/pendingFinancialMessages`)
      .where('importBatchId', '==', batchId)
      .get();
    const docs = snapshot.docs.sort((left, right) =>
      String(left.get('createdAt') ?? '').localeCompare(String(right.get('createdAt') ?? '')));
    const slice = docs.slice(0, maxItems);

    let approved = 0;
    let discarded = 0;
    const skipped: { pendingId: string; reason: string }[] = [];
    for (const doc of slice) {
      const pendingId = doc.id;
      try {
        if (action === 'discard') {
          await runCallable(discardPendingFinancialMessage, uid, { householdId, pendingId });
          discarded++;
          continue;
        }
        const pending = doc.data() as PendingFinancialMessage;
        if (pending.conversionRequired) {
          skipped.push({ pendingId, reason: 'needs_conversion' });
          continue;
        }
        if (!pending.suggestedAccountId) {
          skipped.push({ pendingId, reason: 'needs_account' });
          continue;
        }
        if (pending.kind === 'transfer' && !pending.suggestedDestinationAccountId) {
          skipped.push({ pendingId, reason: 'needs_destination' });
          continue;
        }
        // Category is intentionally omitted: the approve handler falls back
        // to the stored suggestion, then merchant-pattern rules, and throws
        // when nothing matches — that item is skipped for manual review.
        await runCallable(approvePendingFinancialMessage, uid, {
          householdId,
          pendingId,
          accountId: pending.suggestedAccountId,
          destinationAccountId: pending.kind === 'transfer' ? pending.suggestedDestinationAccountId! : undefined,
        });
        approved++;
      } catch (error) {
        skipped.push({ pendingId, reason: error instanceof HttpsError ? error.code : 'error' });
      }
    }

    return {
      action,
      approved,
      discarded,
      skipped,
      hasMore: docs.length > slice.length,
    } satisfies DecideImportBatchResult;
  },
);
