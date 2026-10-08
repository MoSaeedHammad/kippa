import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Account, Card, Loan, RecurringTransactionRule } from '@kippa/domain';
import { requireFullHouseholdMember } from '../../libs/householdAccess.js';

/** Firestore batches cap at 500 writes — stay safely below. */
const OPS_PER_BATCH = 400;

export type AccountWipePreview = {
  transactions: number;
  cards: number;
  recurringRules: string[];
  blockingLoan: { id: string; name: string } | null;
};

/** Commits delete operations in Firestore-sized chunks. */
async function deleteInChunks(
  db: Firestore,
  refs: { id: string; path: string }[],
): Promise<number> {
  let ops = 0;
  for (let start = 0; start < refs.length; start += OPS_PER_BATCH) {
    const batch = db.batch();
    for (const ref of refs.slice(start, start + OPS_PER_BATCH)) {
      batch.delete(db.doc(ref.path));
      ops += 1;
    }
    await batch.commit();
  }
  return ops;
}

/**
 * Completely removes an account from the system: the account doc, every card
 * tied to it, their statements, every ledger line, every transaction that
 * touched the account (including its other legs and conversion details), and
 * cancels recurring rules or certificates that paid into it. Active loans
 * funded from the account are refused first — re-point them before wiping.
 */
async function wipeAccountData(householdId: string, accountId: string, uid: string, displayName: string): Promise<{ deletedTransactions: number }> {
  const db = getFirestore();
  const accountRef = db.doc(`households/${householdId}/accounts/${accountId}`);
  const accountSnap = await accountRef.get();
  const account = accountSnap.data() as Account | undefined;
  if (!account) throw new HttpsError('not-found', 'Account not found.');

  const [loansSnap, rulesSnap, certificatesSnap, cardsSnap] = await Promise.all([
    db.collection(`households/${householdId}/loans`).get(),
    db.collection(`households/${householdId}/recurringTransactionRules`)
      .where('status', '==', 'active').get(),
    db.collection(`households/${householdId}/certificates`)
      .where('status', '==', 'active').get(),
    db.collection(`households/${householdId}/cards`)
      .where('parentAccountId', '==', accountId).get(),
  ]);

  const fundingLoan = loansSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Loan, 'id'>) }))
    .find((loan) => loan.paymentAccountId === accountId && loan.status === 'active');
  if (fundingLoan) {
    throw new HttpsError('failed-precondition', `The account funds the active loan "${fundingLoan.name}" — re-point the loan to another account first.`);
  }

  const now = new Date().toISOString();
  const linkedCardIds = cardsSnap.docs.map((doc) => doc.id);

  // Statements of the linked cards go with the wipe.
  const statementRefs: { id: string; path: string }[] = [];
  for (const cardId of linkedCardIds) {
    const statements = await db.collection(`households/${householdId}/cardStatements`)
      .where('cardId', '==', cardId).get();
    statements.docs.forEach((doc) => statementRefs.push({ id: doc.id, path: doc.ref.path }));
  }

  // Every ledger line on the account pins the transactions that must go.
  const linesSnap = await db.collection(`households/${householdId}/ledgerLines`)
    .where('accountId', '==', accountId).get();
  const lineRefs = linesSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path }));
  const transactionIds = Array.from(new Set(
    linesSnap.docs.map((doc) => (doc.data() as { transactionId?: string }).transactionId)
      .filter((id): id is string => !!id),
  ));

  // All ledger lines of the doomed transactions — including legs on OTHER
  // accounts, so counter-accounts don't keep phantom balances.
  const allLineRefs: { id: string; path: string }[] = [...lineRefs];
  const conversionRefs: { id: string; path: string }[] = [];
  for (const transactionId of transactionIds) {
    const txLines = await db.collection(`households/${householdId}/ledgerLines`)
      .where('transactionId', '==', transactionId).get();
    txLines.docs.forEach((doc) => {
      if (!allLineRefs.some((existing) => existing.id === doc.id)) {
        allLineRefs.push({ id: doc.id, path: doc.ref.path });
      }
    });
    conversionRefs.push({ id: transactionId, path: `households/${householdId}/conversionDetails/${transactionId}` });
  }

  // Cancel recurring rules and certificates that pay into this account.
  const cancelOps: { path: string; data: Record<string, unknown> }[] = [];
  for (const doc of rulesSnap.docs) {
    const rule = doc.data() as RecurringTransactionRule;
    if (rule.accountId === accountId || rule.destinationAccountId === accountId) {
      cancelOps.push({ path: doc.ref.path, data: { status: 'cancelled', updatedAt: Date.now() } });
    }
  }
  for (const doc of certificatesSnap.docs) {
    if ((doc.data() as { accountId?: string }).accountId === accountId) {
      cancelOps.push({ path: doc.ref.path, data: { status: 'redeemed', updatedAt: now } });
    }
  }

  await deleteInChunks(db, allLineRefs);
  await deleteInChunks(db, statementRefs);
  await deleteInChunks(db, conversionRefs);
  await deleteInChunks(db, transactionIds.map((id) => ({ id, path: `households/${householdId}/transactions/${id}` })));
  await deleteInChunks(db, linkedCardIds.map((id) => ({ id, path: `households/${householdId}/cards/${id}` })));
  for (const op of cancelOps) {
    await db.doc(op.path).set(op.data, { merge: true });
  }
  await accountRef.delete();

  await db.doc(`households/${householdId}/auditLog/account_wiped_${accountId}_${Date.now()}`).create({
    id: `account_wiped_${accountId}_${Date.now()}`,
    householdId,
    userId: uid,
    userDisplayName: displayName,
    action: 'account_deleted',
    summary: `${displayName} wiped account "${account.name}" and all its data (${transactionIds.length} transactions, ${linkedCardIds.length} cards)`,
    details: { accountId, accountName: account.name, deletedTransactions: transactionIds.length, deletedCards: linkedCardIds.length },
    createdAt: now,
  });
  return { deletedTransactions: transactionIds.length };
}

/** Removes one card. A credit card takes its hidden debt-bucket account and all its data with it. */
export const deleteCard = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; cardId?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const cardId = typeof data.cardId === 'string' ? data.cardId.trim() : '';
  if (!householdId || !cardId) throw new HttpsError('invalid-argument', 'householdId and cardId are required.');
  const caller = await requireFullHouseholdMember(uid, householdId);

  const db = getFirestore();
  const cardSnap = await db.doc(`households/${householdId}/cards/${cardId}`).get();
  const card = cardSnap.data() as Card | undefined;
  if (!card) throw new HttpsError('not-found', 'Card not found.');

  if (card.kind === 'credit' && card.parentAccountId) {
    // The credit account is the card's debt bucket and is hidden from the
    // accounts list — a card removal without it would strand hidden data.
    const result = await wipeAccountData(householdId, card.parentAccountId, uid, caller.displayName || 'User');
    return { deleted: true, wipedAccountId: card.parentAccountId, ...result };
  }

  await deleteInChunks(db, [{ id: cardId, path: `households/${householdId}/cards/${cardId}` }]);
  await db.doc(`households/${householdId}/auditLog/card_deleted_${cardId}_${Date.now()}`).create({
    id: `card_deleted_${cardId}_${Date.now()}`,
    householdId,
    userId: uid,
    userDisplayName: caller.displayName || 'User',
    action: 'card_deleted',
    summary: `${caller.displayName || 'User'} removed card "${card.name}"`,
    details: { cardId, cardName: card.name },
    createdAt: new Date().toISOString(),
  });
  return { deleted: true };
});

/** Fully wipes an account and everything tied to it (see wipeAccountData). */
export const wipeAccount = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; accountId?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const accountId = typeof data.accountId === 'string' ? data.accountId.trim() : '';
  if (!householdId || !accountId) throw new HttpsError('invalid-argument', 'householdId and accountId are required.');
  const caller = await requireFullHouseholdMember(uid, householdId);
  return wipeAccountData(householdId, accountId, uid, caller.displayName || 'User');
});

/** Read-only preview of what a wipe would remove, for the confirmation dialog. */
export const previewAccountWipe = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; accountId?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const accountId = typeof data.accountId === 'string' ? data.accountId.trim() : '';
  if (!householdId || !accountId) throw new HttpsError('invalid-argument', 'householdId and accountId are required.');
  await requireFullHouseholdMember(uid, householdId);

  const db = getFirestore();
  const [linesSnap, cardsSnap, loansSnap, rulesSnap] = await Promise.all([
    db.collection(`households/${householdId}/ledgerLines`).where('accountId', '==', accountId).get(),
    db.collection(`households/${householdId}/cards`).where('parentAccountId', '==', accountId).get(),
    db.collection(`households/${householdId}/loans`).get(),
    db.collection(`households/${householdId}/recurringTransactionRules`).where('status', '==', 'active').get(),
  ]);
  const transactionIds = new Set(
    linesSnap.docs.map((doc) => (doc.data() as { transactionId?: string }).transactionId)
      .filter((id): id is string => !!id),
  );
  const blockingLoan = loansSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<Loan, 'id'>) }))
    .find((loan) => loan.paymentAccountId === accountId && loan.status === 'active');
  const affectedRules = rulesSnap.docs
    .map((doc) => doc.data() as RecurringTransactionRule)
    .filter((rule) => rule.accountId === accountId || rule.destinationAccountId === accountId);

  return {
    transactions: transactionIds.size,
    cards: cardsSnap.size,
    recurringRules: affectedRules.map((rule) => rule.description),
    blockingLoan: blockingLoan ? { id: blockingLoan.id, name: blockingLoan.name } : null,
  } satisfies AccountWipePreview;
});
