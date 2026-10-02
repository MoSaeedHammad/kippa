import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import type { Account, FinanceTransaction } from '@kippa/domain';
import {
  applyApproval,
  validateTransferDraftInput,
} from '../../domain/transactions/transferApprovals.js';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

function nowIso(): string {
  return new Date().toISOString();
}

async function loadAccounts(householdId: string, sourceId: string, destinationId: string): Promise<[Account, Account]> {
  const db = getFirestore();
  const [sourceSnap, destinationSnap] = await Promise.all([
    db.doc(`households/${householdId}/accounts/${sourceId}`).get(),
    db.doc(`households/${householdId}/accounts/${destinationId}`).get(),
  ]);
  const source = sourceSnap.data() as Account | undefined;
  const destination = destinationSnap.data() as Account | undefined;
  if (!source?.isActive || !destination?.isActive) {
    throw new HttpsError('failed-precondition', 'Both accounts must be active.');
  }
  return [source, destination];
}

async function notify(householdId: string, uid: string, title: string, body: string, deepLink: string): Promise<void> {
  try {
    const tokens = await getTokensForUsers(householdId, [uid]);
    if (tokens.length === 0) return;
    await sendToMany(householdId, tokens, buildMessagePayload({ type: 'transaction', title, body, householdId, deepLink }));
  } catch (error) {
    console.error('transfer-approval notification failed', error);
  }
}

/**
 * Creates an account-to-account transfer. When the initiator owns (or is the
 * only owner of) both accounts, it posts immediately. Otherwise a draft is
 * created and every other account owner must approve it in Approvals.
 */
export const proposeTransfer = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as Record<string, unknown>;
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  const profile = await requireFullHouseholdMember(uid, householdId);

  const todayIso = new Date().toISOString().slice(0, 10);
  const input = (() => {
    const result = validateTransferDraftInput(data as never, todayIso);
    if (!result.ok) throw new HttpsError('invalid-argument', result.error);
    return result.value;
  })();

  const [source, destination] = await loadAccounts(householdId, input.sourceAccountId, input.destinationAccountId);
  const destinationAmount = input.destinationAmount ?? input.amount;
  const destinationCurrency = destination.currency;
  const description = input.description || `Transfer to ${destination.name}`;
  const now = nowIso();

  const db = getFirestore();
  const requiredApprovals = (() => {
    const owners = new Set<string>();
    if (source.ownerUid) owners.add(source.ownerUid);
    if (destination.ownerUid) owners.add(destination.ownerUid);
    owners.delete(uid);
    return [...owners].sort();
  })();

  const transactionId = `transfer_${crypto.randomUUID()}`;

  if (requiredApprovals.length === 0) {
    // Post immediately — same behaviour as the old client-side path.
    const batch = db.batch();
    const activeCycleSnap = await db.collection(`households/${householdId}/budgetCycles`).where('status', '==', 'open').limit(1).get();
    const activeCycleId = activeCycleSnap.empty ? null : activeCycleSnap.docs[0].id;
    const posted: FinanceTransaction = {
      id: transactionId, householdId, type: 'transfer', date: input.date,
      description, categoryId: null, budgetCycleId: activeCycleId, createdBy: uid,
      createdAt: now, updatedAt: now, status: 'posted',
      transferDraft: null,
    };
    batch.set(db.doc(`households/${householdId}/transactions/${transactionId}`), posted);
    batch.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_source`), {
      id: `${transactionId}_source`, householdId, transactionId, accountId: source.id,
      signedAmount: -input.amount, currency: source.currency, createdAt: now,
    });
    batch.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_destination`), {
      id: `${transactionId}_destination`, householdId, transactionId, accountId: destination.id,
      signedAmount: destinationAmount, currency: destinationCurrency, createdAt: now,
    });
    if (source.currency !== destinationCurrency) {
      batch.set(db.doc(`households/${householdId}/conversionDetails/${transactionId}`), {
        transactionId, fromCurrency: source.currency, toCurrency: destinationCurrency,
        fromAmount: input.amount, toAmount: destinationAmount,
        effectiveRate: destinationAmount / input.amount, rateSource: 'manual',
      });
    }
    await batch.commit();
    return { status: 'posted' as const, transactionId };
  }

  const draft: FinanceTransaction = {
    id: transactionId, householdId, type: 'transfer', date: input.date,
    description, categoryId: null, budgetCycleId: null, createdBy: uid,
    createdAt: now, updatedAt: now, status: 'draft',
    transferDraft: {
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      amount: input.amount,
      currency: source.currency,
      destinationAmount,
      destinationCurrency,
      requiredApprovals,
      approvals: [],
    },
  };
  await db.doc(`households/${householdId}/transactions/${transactionId}`).set(draft);
  for (const approver of requiredApprovals) {
    await notify(
      householdId, approver, 'Approve transfer',
      `${profile.displayName || 'Someone'}: ${input.amount} ${source.currency} → ${destination.name}`,
      '/pending',
    );
  }
  return { status: 'pending' as const, transactionId, requiredApprovals };
});

/**
 * Owner decision on a draft transfer. Every required owner must approve;
 * a single reject voids the draft.
 */
export const decideDraftTransfer = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; transactionId?: unknown; action?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const transactionId = typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
  const action = data.action;
  if (!householdId || !transactionId) throw new HttpsError('invalid-argument', 'householdId and transactionId are required.');
  if (action !== 'approve' && action !== 'reject') {
    throw new HttpsError('invalid-argument', "action must be 'approve' or 'reject'.");
  }
  const caller = await requireFullHouseholdMember(uid, householdId);
  const db = getFirestore();
  const transactionRef = db.doc(`households/${householdId}/transactions/${transactionId}`);
  const now = nowIso();

  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(transactionRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Transfer not found.');
    const txn = snapshot.data() as FinanceTransaction;
    if (txn.status !== 'draft' || !txn.transferDraft) {
      throw new HttpsError('failed-precondition', `This transfer is already ${txn.status}.`);
    }
    const decision = applyApproval(txn.transferDraft, uid, now);
    if (!decision.mayDecide) {
      throw new HttpsError('permission-denied', 'Only a required approver can decide this transfer.');
    }

    if (action === 'reject') {
      transaction.update(transactionRef, { status: 'voided', updatedAt: now, 'transferDraft.approvals': decision.approvedBy });
      return { status: 'voided' as const, remaining: [] as string[], initiator: txn.createdBy, txn };
    }

    if (decision.remaining.length > 0) {
      transaction.update(transactionRef, {
        updatedAt: now,
        'transferDraft.approvals': decision.approvedBy,
      });
      return { status: 'partially-approved' as const, remaining: decision.remaining, initiator: txn.createdBy, txn };
    }

    const posted: FinanceTransaction = { ...txn, status: 'posted', updatedAt: now };
    transaction.set(transactionRef, posted);
    transaction.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_source`), {
      id: `${transactionId}_source`, householdId, transactionId, accountId: txn.transferDraft.sourceAccountId,
      signedAmount: -txn.transferDraft.amount, currency: txn.transferDraft.currency, createdAt: now,
    });
    transaction.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_destination`), {
      id: `${transactionId}_destination`, householdId, transactionId, accountId: txn.transferDraft.destinationAccountId,
      signedAmount: txn.transferDraft.destinationAmount, currency: txn.transferDraft.destinationCurrency, createdAt: now,
    });
    if (txn.transferDraft.currency !== txn.transferDraft.destinationCurrency) {
      transaction.set(db.doc(`households/${householdId}/conversionDetails/${transactionId}`), {
        transactionId, fromCurrency: txn.transferDraft.currency, toCurrency: txn.transferDraft.destinationCurrency,
        fromAmount: txn.transferDraft.amount, toAmount: txn.transferDraft.destinationAmount,
        effectiveRate: txn.transferDraft.destinationAmount / txn.transferDraft.amount, rateSource: 'manual',
      });
    }
    return { status: 'posted' as const, remaining: [] as string[], initiator: txn.createdBy, txn };
  });

  const amountLabel = `${result.txn.transferDraft!.amount} ${result.txn.transferDraft!.currency}`;
  if (action === 'reject') {
    await notify(householdId, result.initiator, 'Transfer declined', `${caller.displayName || 'Someone'} declined ${amountLabel}`, '/transactions');
  } else if (result.status === 'posted') {
    await notify(householdId, result.initiator, 'Transfer approved', `${caller.displayName || 'Someone'} approved ${amountLabel}`, '/transactions');
  }
  return { status: result.status, remaining: result.remaining };
});
