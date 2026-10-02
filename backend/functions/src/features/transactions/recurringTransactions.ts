import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { Account, Category, FinanceTransaction, RecurringTransactionRule } from '@kippa/domain';
import { dueOccurrenceDates } from '../../domain/shared-balance/recurring.js';
import {
  buildRecurringDraftTransaction,
  recurringTransactionId,
  validateRecurringTransactionInput,
} from '../../domain/transactions/recurringTransactions.js';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

const MAX_ACTIVE_RULES_PER_HOUSEHOLD = 30;

async function loadRuleContext(householdId: string, input: { accountId: string; categoryId: string | null; type: 'income' | 'expense' }): Promise<Account> {
  const db = getFirestore();
  const accountSnap = await db.doc(`households/${householdId}/accounts/${input.accountId}`).get();
  const account = accountSnap.data() as Account | undefined;
  if (!account?.isActive) {
    throw new HttpsError('failed-precondition', 'Choose an active account.');
  }
  if (input.categoryId) {
    const categorySnap = await db.doc(`households/${householdId}/categories/${input.categoryId}`).get();
    const category = categorySnap.data() as Partial<Category> | undefined;
    if (!category?.isActive || category.type !== input.type) {
      throw new HttpsError('failed-precondition', 'Choose an active category matching the type.');
    }
  }
  return account;
}

/**
 * Creates / pauses / resumes / cancels a recurring income or expense rule.
 * Occurrences are materialized daily as draft transactions and confirmed in
 * the Approvals page.
 */
export const upsertRecurringTransactionRule = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as Record<string, unknown>;
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const action = data.action;
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  if (action !== 'create' && action !== 'edit' && action !== 'pause' && action !== 'resume' && action !== 'cancel') {
    throw new HttpsError('invalid-argument', 'action is invalid.');
  }
  const caller = await requireFullHouseholdMember(uid, householdId);
  const db = getFirestore();
  const now = Date.now();
  const todayIso = new Date().toISOString().slice(0, 10);

  if (action === 'create') {
    const input = (() => {
      const result = validateRecurringTransactionInput(data as never, todayIso);
      if (!result.ok) throw new HttpsError('invalid-argument', result.error);
      return result.value;
    })();
    const account = await loadRuleContext(householdId, input);
    const activeCount = (await db.collection(`households/${householdId}/recurringTransactionRules`).where('status', '==', 'active').get()).size;
    if (activeCount >= MAX_ACTIVE_RULES_PER_HOUSEHOLD) {
      throw new HttpsError('failed-precondition', 'Too many active rules.');
    }
    const ruleId = `rtr_${crypto.randomUUID()}`;
    const rule: RecurringTransactionRule = {
      id: ruleId, householdId, ...input, currency: account.currency,
      status: 'active', createdBy: uid,
      occurrencesCreated: 0, lastOccurrenceDate: null, resumedDate: null,
      createdAt: now, updatedAt: now,
    };
    await db.doc(`households/${householdId}/recurringTransactionRules/${ruleId}`).set(rule);
    // Materialize the anchor occurrence right away when it is due today or past.
    if (input.anchorDate <= todayIso) {
      const draft = buildRecurringDraftTransaction(rule, input.anchorDate, new Date().toISOString());
      await db.doc(`households/${householdId}/transactions/${draft.id}`).set(draft);
      await db.doc(`households/${householdId}/recurringTransactionRules/${ruleId}`).update({
        occurrencesCreated: 1, lastOccurrenceDate: input.anchorDate,
      });
    }
    return { ruleId };
  }

  const ruleId = typeof data.ruleId === 'string' ? data.ruleId.trim() : '';
  if (!ruleId) throw new HttpsError('invalid-argument', 'ruleId is required.');
  const ruleRef = db.doc(`households/${householdId}/recurringTransactionRules/${ruleId}`);
  const snapshot = await ruleRef.get();
  const existing = snapshot.data() as RecurringTransactionRule | undefined;
  if (!existing || existing.householdId !== householdId) throw new HttpsError('not-found', 'Rule not found.');

  if (action === 'edit') {
    const input = (() => {
      const result = validateRecurringTransactionInput({ ...(existing as unknown as Record<string, unknown>), ...(data as Record<string, unknown>) }, todayIso);
      if (!result.ok) throw new HttpsError('invalid-argument', result.error);
      return result.value;
    })();
    await loadRuleContext(householdId, input);
    await ruleRef.update({ ...input, updatedAt: now });
    return { ruleId };
  }
  if (action === 'pause') {
    await ruleRef.update({ status: 'paused', updatedAt: now });
    return { ruleId };
  }
  if (action === 'cancel') {
    await ruleRef.update({ status: 'cancelled', updatedAt: now });
    return { ruleId };
  }
  // resume — occurrences inside the pause window are never backfilled.
  await ruleRef.update({ status: 'active', resumedDate: todayIso, updatedAt: now });
  return { ruleId };
});

/** Confirm (post) or skip (void) one recurring draft occurrence. */
export const confirmRecurringTransaction = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; transactionId?: unknown; action?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const transactionId = typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
  const action = data.action;
  if (!householdId || !transactionId) throw new HttpsError('invalid-argument', 'householdId and transactionId are required.');
  if (action !== 'confirm' && action !== 'skip') {
    throw new HttpsError('invalid-argument', "action must be 'confirm' or 'skip'.");
  }
  const caller = await requireFullHouseholdMember(uid, householdId);
  const db = getFirestore();
  const transactionRef = db.doc(`households/${householdId}/transactions/${transactionId}`);
  const now = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(transactionRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Occurrence not found.');
    const txn = snapshot.data() as FinanceTransaction;
    if (txn.status !== 'draft' || !txn.recurringDraft) {
      throw new HttpsError('failed-precondition', `This occurrence is already ${txn.status}.`);
    }
    if (action === 'skip') {
      transaction.update(transactionRef, { status: 'voided', updatedAt: now });
      return;
    }
    // confirm — validate the account/category are still usable, then post.
    const accountSnap = await transaction.get(db.doc(`households/${householdId}/accounts/${txn.recurringDraft.accountId}`));
    if (!(accountSnap.data() as { isActive?: boolean } | undefined)?.isActive) {
      throw new HttpsError('failed-precondition', 'The account is no longer active — edit the rule first.');
    }
    if (txn.recurringDraft.categoryId) {
      const categorySnap = await transaction.get(db.doc(`households/${householdId}/categories/${txn.recurringDraft.categoryId}`));
      const category = categorySnap.data() as Partial<Category> | undefined;
      if (!category?.isActive || category.type !== txn.type) {
        throw new HttpsError('failed-precondition', 'The category is no longer valid — edit the rule first.');
      }
    }
    transaction.update(transactionRef, { status: 'posted', updatedAt: now });
    transaction.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_main`), {
      id: `${transactionId}_main`, householdId, transactionId, accountId: txn.recurringDraft.accountId,
      signedAmount: txn.type === 'income' ? txn.recurringDraft.amount : -txn.recurringDraft.amount,
      currency: txn.recurringDraft.currency, createdAt: now,
    });
    transaction.create(db.doc(`households/${householdId}/auditLog/${transactionId}`), {
      id: transactionId, householdId, userId: uid,
      userDisplayName: caller.displayName || 'User', userPhotoURL: caller.photoURL ?? null,
      action: 'transaction_created',
      summary: `${caller.displayName || 'User'} confirmed recurring ${txn.type}: ${txn.recurringDraft.amount} ${txn.recurringDraft.currency} — ${txn.description}`,
      details: { transactionId, recurring: true },
      createdAt: now,
    });
  });
  return { status: action === 'confirm' ? 'posted' : 'voided' };
});

/** Shared with the cron: materializes due occurrences for one rule. */
export async function materializeRecurringTransactionOccurrences(rule: RecurringTransactionRule, todayIso: string): Promise<number> {
  const db = getFirestore();
  const dates = dueOccurrenceDates(rule, todayIso);
  let created = 0;
  for (const date of dates) {
    const draft = buildRecurringDraftTransaction(rule, date, new Date().toISOString());
    const ref = db.doc(`households/${householdIdPath(rule)}/transactions/${recurringTransactionId(rule.id, date)}`);
    const existing = await ref.get();
    if (existing.exists) continue;
    await ref.set(draft);
    created += 1;
  }
  if (dates.length > 0) {
    await db.doc(`households/${householdIdPath(rule)}/recurringTransactionRules/${rule.id}`).update({
      occurrencesCreated: rule.occurrencesCreated + created,
      lastOccurrenceDate: dates[dates.length - 1],
      updatedAt: Date.now(),
    });
  }
  return created;
}

function householdIdPath(rule: Pick<RecurringTransactionRule, 'householdId'>): string {
  return rule.householdId;
}
