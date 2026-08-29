import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { projectID } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import type { Account, Card, Category, FinanceTransaction, Loan, PendingFinancialMessage, UserProfile } from '@kippa/domain';
import { buildMessagePreview, parseFinancialMessage, type ParsedFinancialMessage } from '../../domain/message-ingestion/parser.js';
import { settledAmounts } from '../../domain/message-ingestion/conversion.js';
import { extractMessage, extractSender } from '../../domain/message-ingestion/ingestBody.js';
import { pickSuggestions } from '../../domain/message-ingestion/suggestions.js';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';

type IngestionCredential = {
  id: string;
  ownerUid: string;
  householdId: string;
  label: string;
  secretHash: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
};

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

type IngestBody = {
  message?: unknown;
  text?: unknown;
  body?: unknown;
  sms?: unknown;
  content?: unknown;
  sender?: unknown;
  source?: unknown;
  idempotencyKey?: unknown;
  receivedAt?: unknown;
};

const MAX_MESSAGE_LENGTH = 5_000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cleanSource(value: unknown): string {
  if (typeof value !== 'string') return 'device';
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 64);
  return cleaned || 'device';
}

function assertString(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${label} is required.`);
  }
  if (value.length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} is too long.`);
  }
  return value.trim();
}

async function requireHouseholdMember(uid: string, householdId: string): Promise<UserProfile> {
  const snapshot = await getFirestore().doc(`users/${uid}`).get();
  const profile = snapshot.data() as UserProfile | undefined;
  const memberships = profile?.householdIds ?? (profile?.householdId ? [profile.householdId] : []);
  if (!profile || !memberships.includes(householdId)) {
    throw new HttpsError('permission-denied', 'You are not a member of this household.');
  }
  return profile;
}

function credentialMatches(credential: IngestionCredential, suppliedSecret: string): boolean {
  const expected = Buffer.from(credential.secretHash, 'hex');
  const supplied = Buffer.from(sha256(suppliedSecret), 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

async function resolveSuggestions(
  householdId: string,
  parsed: ParsedFinancialMessage,
): Promise<{ accountId?: string; destinationAccountId?: string; conversionRequired: boolean }> {
  const db = getFirestore();
  const [accountsSnapshot, cardsSnapshot] = await Promise.all([
    db.collection(`households/${householdId}/accounts`).get(),
    db.collection(`households/${householdId}/cards`).get(),
  ]);
  const accounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Account);
  const cards = cardsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Card);
  return pickSuggestions(accounts, cards, parsed);
}

function installmentDate(loan: Loan, installmentNumber: number): string {
  const first = new Date(`${loan.firstPaymentDate}T12:00:00Z`);
  const target = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + installmentNumber - 1, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(loan.dueDay, lastDay));
  return target.toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string): number {
  return Math.round(Math.abs(new Date(`${left}T12:00:00Z`).getTime() - new Date(`${right}T12:00:00Z`).getTime()) / 86_400_000);
}

async function resolveLoanSuggestion(
  householdId: string,
  parsed: ParsedFinancialMessage,
  accountId?: string,
): Promise<{ loanId: string; loanName: string; installmentNumber: number } | null> {
  if (parsed.kind !== 'expense' || !accountId) return null;
  const db = getFirestore();
  const [loansSnapshot, transactionsSnapshot] = await Promise.all([
    db.collection(`households/${householdId}/loans`).where('status', '==', 'active').get(),
    db.collection(`households/${householdId}/transactions`).get(),
  ]);
  const transactions = transactionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as FinanceTransaction);
  const matches = loansSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Loan)
    .flatMap((loan) => {
      const linkedPayments = transactions.filter((transaction) => transaction.status === 'posted' && transaction.loanId === loan.id);
      const installmentNumber = (loan.openingPaidInstallments ?? 0) + linkedPayments.length + 1;
      if (loan.paymentAccountId !== accountId
        || loan.currency !== parsed.currency
        || Math.abs(loan.installmentAmount - parsed.amount) > 0.01
        || installmentNumber > loan.totalInstallments) return [];
      const dueDate = installmentDate(loan, installmentNumber);
      const allowedDays = Math.max(3, (loan.graceDay ?? loan.dueDay) - loan.dueDay + 2);
      return daysBetween(parsed.date, dueDate) <= allowedDays
        ? [{ loanId: loan.id, loanName: loan.name, installmentNumber }]
        : [];
    });
  return matches.length === 1 ? matches[0] : null;
}

export const createMessageIngestionCredential = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = assertString((request.data as { householdId?: unknown })?.householdId, 'householdId');
  const label = typeof (request.data as { label?: unknown })?.label === 'string'
    ? (request.data as { label: string }).label.trim().slice(0, 80) || 'SMS forwarder'
    : 'SMS forwarder';
  await requireHouseholdMember(uid, householdId);

  const runtimeProjectId = projectID.value();
  if (!runtimeProjectId) {
    throw new HttpsError('internal', 'Firebase project configuration is unavailable.');
  }

  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const credential: IngestionCredential = {
    id,
    ownerUid: uid,
    householdId,
    label,
    secretHash: sha256(secret),
    enabled: true,
    createdAt: now,
    lastUsedAt: null,
  };
  await getFirestore().doc(`messageIngestionCredentials/${id}`).set(credential);

  return {
    credentialId: id,
    token: `${id}.${secret}`,
    endpoint: `https://us-central1-${runtimeProjectId}.cloudfunctions.net/ingestFinancialMessage`,
  };
});

export const listMessageIngestionCredentials = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = assertString((request.data as { householdId?: unknown })?.householdId, 'householdId');
  await requireHouseholdMember(uid, householdId);
  const snapshot = await getFirestore().collection('messageIngestionCredentials')
    .where('ownerUid', '==', uid)
    .get();
  return {
    credentials: snapshot.docs.filter((doc) => {
      const credential = doc.data() as IngestionCredential;
      return credential.householdId === householdId;
    }).map((doc) => {
      const credential = doc.data() as IngestionCredential;
      return {
        id: credential.id,
        label: credential.label,
        enabled: credential.enabled,
        createdAt: credential.createdAt,
        lastUsedAt: credential.lastUsedAt ?? null,
      };
    }),
  };
});

export const revokeMessageIngestionCredential = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const credentialId = assertString((request.data as { credentialId?: unknown })?.credentialId, 'credentialId');
  const ref = getFirestore().doc(`messageIngestionCredentials/${credentialId}`);
  const snapshot = await ref.get();
  const credential = snapshot.data() as IngestionCredential | undefined;
  if (!credential || credential.ownerUid !== uid) throw new HttpsError('not-found', 'Connection not found.');
  await ref.set({ enabled: false, revokedAt: new Date().toISOString() }, { merge: true });
  return { revoked: true };
});

export const ingestFinancialMessage = onRequest(
  { cors: false, maxInstances: 10, timeoutSeconds: 30 },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const authHeader = request.get('authorization') ?? '';
    const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
    const [credentialId, suppliedSecret] = token?.split('.', 2) ?? [];
    if (!credentialId || !suppliedSecret) {
      response.status(401).json({ error: 'unauthorized' });
      return;
    }

    const db = getFirestore();
    const credentialRef = db.doc(`messageIngestionCredentials/${credentialId}`);
    const credentialSnapshot = await credentialRef.get();
    const credential = credentialSnapshot.data() as IngestionCredential | undefined;
    if (!credential || !credential.enabled || !credentialMatches(credential, suppliedSecret)) {
      response.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      await requireHouseholdMember(credential.ownerUid, credential.householdId);
    } catch {
      response.status(403).json({ error: 'membership_revoked' });
      return;
    }

    const message = extractMessage(request.body);
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      response.status(400).json({ error: 'invalid_message' });
      return;
    }
    const source = cleanSource((request.body as IngestBody).source);
    const sender = extractSender(request.body);
    const parsedResult = parseFinancialMessage(message, source, sender);
    const idempotencyKey = (request.body as IngestBody).idempotencyKey;
    const dedupeMaterial = typeof idempotencyKey === 'string' && idempotencyKey.trim()
      ? idempotencyKey.trim().slice(0, 256)
      : message.replace(/\s+/g, ' ').trim();
    const receiptId = sha256(`${credentialId}\0${dedupeMaterial}`);
    const receiptRef = db.doc(`messageIngestionReceipts/${receiptId}`);
    const existingReceipt = await receiptRef.get();
    if (existingReceipt.exists) {
      const existing = existingReceipt.data() as IngestionReceipt;
      response.status(200).json({ accepted: existing.state === 'pending', duplicate: true, state: existing.state, pendingId: existing.pendingId ?? null });
      return;
    }

    const now = new Date().toISOString();
    if (parsedResult.outcome === 'notification') {
      const receipt: IngestionReceipt = {
        id: receiptId,
        credentialId,
        householdId: credential.householdId,
        state: 'ignored',
        createdAt: now,
        updatedAt: now,
      };
      await Promise.all([
        receiptRef.set(receipt),
        credentialRef.set({ lastUsedAt: now }, { merge: true }),
      ]);
      const tokens = await getTokensForUsers(credential.householdId, [credential.ownerUid]);
      await sendToMany(
        credential.householdId,
        tokens,
        buildMessagePayload({
          type: 'card_payment_detected',
          title: parsedResult.title,
          body: parsedResult.message,
          householdId: credential.householdId,
          deepLink: parsedResult.deepLink,
        }),
      ).catch((error) => console.error('Could not send card-payment notification', error));
      response.status(200).json({ accepted: false, notificationSent: true });
      return;
    }

    if (parsedResult.outcome !== 'matched') {
      const receipt: IngestionReceipt = {
        id: receiptId,
        credentialId,
        householdId: credential.householdId,
        state: 'ignored',
        createdAt: now,
        updatedAt: now,
      };
      await Promise.all([
        receiptRef.set(receipt),
        credentialRef.set({ lastUsedAt: now }, { merge: true }),
      ]);
      response.status(200).json({ accepted: false, ignored: true, reason: parsedResult.reason });
      return;
    }

    const suggestions = await resolveSuggestions(credential.householdId, parsedResult.parsed);
    const loanSuggestion = await resolveLoanSuggestion(credential.householdId, parsedResult.parsed, suggestions.accountId);
    const parsed = parsedResult.parsed;

    // ── Cross-currency transfer merge ──────────────────────────────────
    // Phone Banking Transfers arrive as two SMS (one per leg). When the
    // second leg arrives we merge it with the first half-pending doc into
    // a single cross-currency transfer.
    if (parsed.transferLeg && parsed.mergeKey) {
      const oppositeLeg = parsed.transferLeg === 'debit' ? 'credit' : 'debit';
      const halfPendingSnap = await db.collection(`households/${credential.householdId}/pendingFinancialMessages`)
        .where('mergeKey', '==', parsed.mergeKey)
        .where('transferLeg', '==', oppositeLeg)
        .where('date', '==', parsed.date)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!halfPendingSnap.empty) {
        // Merge the two legs into one cross-currency transfer.
        const half = halfPendingSnap.docs[0].data() as PendingFinancialMessage;
        const debit = parsed.transferLeg === 'debit' ? parsed : half;
        const credit = parsed.transferLeg === 'credit' ? parsed : half;

        const mergedSuggestions = await resolveSuggestions(credential.householdId, {
          ...parsed,
          currency: debit.currency,
          accountHintLast4: debit.accountHintLast4 ?? undefined,
          destinationHintLast4: credit.accountHintLast4 ?? undefined,
          destinationKind: 'cash' as const,
          // resolveSuggestions uses currency for destination matching — we override after
        });
        // Resolve the destination account in the credit-leg currency separately.
        const destAccountsSnap = await db.collection(`households/${credential.householdId}/accounts`)
          .where('isActive', '==', true).get();
        const destAccount = destAccountsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Account)
          .find((a) => a.currency === credit.currency && a.type === 'running');

        const mergedPendingId = half.id; // reuse the first-arriving doc id
        const mergedPendingRef = db.doc(`households/${credential.householdId}/pendingFinancialMessages/${mergedPendingId}`);
        const merged: Partial<PendingFinancialMessage> = {
          amount: debit.amount,
          currency: debit.currency,
          destinationAmount: credit.amount,
          destinationCurrency: credit.currency,
          accountHintLast4: debit.accountHintLast4 ?? null,
          destinationHintLast4: credit.accountHintLast4 ?? null,
          suggestedAccountId: mergedSuggestions.accountId ?? null,
          suggestedDestinationAccountId: destAccount?.id ?? null,
          transferLeg: null, // fully merged — no longer a half-pending
          mergeKey: null,
          messagePreview: `${buildMessagePreview(message)} · ${half.messagePreview}`,
        };

        const batch = db.batch();
        batch.set(mergedPendingRef, merged, { merge: true });
        // Delete the second-leg receipt so re-sends don't recreate it.
        batch.set(receiptRef, {
          id: receiptId,
          credentialId,
          householdId: credential.householdId,
          state: 'ignored',
          pendingId: mergedPendingId,
          createdAt: now,
          updatedAt: now,
        } satisfies IngestionReceipt);
        batch.set(credentialRef, { lastUsedAt: now }, { merge: true });
        await batch.commit();

        const tokens = await getTokensForUsers(credential.householdId, [credential.ownerUid]);
        await sendToMany(
          credential.householdId,
          tokens,
          buildMessagePayload({
            type: 'pending_financial_message',
            title: 'Review transfer',
            body: `${debit.amount} ${debit.currency} → ${credit.amount} ${credit.currency} · ${parsed.description}`,
            householdId: credential.householdId,
            deepLink: '/pending',
          }),
        ).catch((error) => console.error('Could not send pending-message notification', error));
        response.status(202).json({ accepted: true, pendingId: mergedPendingId, kind: 'transfer', merged: true });
        return;
      }
    }

    // ── Normal / half-pending creation ─────────────────────────────────
    const pending: PendingFinancialMessage = {
      id: receiptId,
      householdId: credential.householdId,
      receivedBy: credential.ownerUid,
      kind: parsed.kind,
      source,
      provider: parsed.provider,
      amount: parsed.amount,
      currency: parsed.currency,
      date: parsed.date,
      description: loanSuggestion ? `${loanSuggestion.loanName} — installment ${loanSuggestion.installmentNumber}` : parsed.description,
      counterparty: parsed.counterparty ?? null,
      messagePreview: buildMessagePreview(message),
      accountHintLast4: parsed.accountHintLast4 ?? null,
      destinationHintLast4: parsed.destinationHintLast4 ?? null,
      suggestedAccountId: suggestions.accountId ?? null,
      suggestedDestinationAccountId: suggestions.destinationAccountId ?? null,
      suggestedLoanId: loanSuggestion?.loanId ?? null,
      suggestedLoanName: loanSuggestion?.loanName ?? null,
      suggestedLoanInstallmentNumber: loanSuggestion?.installmentNumber ?? null,
      conversionRequired: suggestions.conversionRequired || null,
      destinationAmount: null,
      destinationCurrency: null,
      transferLeg: parsed.transferLeg ?? null,
      mergeKey: parsed.mergeKey ?? null,
      createdAt: now,
      status: 'pending',
    };
    const receipt: IngestionReceipt = {
      id: receiptId,
      credentialId,
      householdId: credential.householdId,
      state: 'pending',
      pendingId: receiptId,
      createdAt: now,
      updatedAt: now,
    };
    const batch = db.batch();
    batch.create(receiptRef, receipt);
    batch.create(db.doc(`households/${credential.householdId}/pendingFinancialMessages/${receiptId}`), pending);
    batch.set(credentialRef, { lastUsedAt: now }, { merge: true });
    await batch.commit();
    const tokens = await getTokensForUsers(credential.householdId, [credential.ownerUid]);
    const notifBody = pending.transferLeg
      ? `${pending.amount} ${pending.currency} · ${pending.description} (waiting for the other leg)`
      : `${pending.amount} ${pending.currency} · ${pending.description}`;
    await sendToMany(
      credential.householdId,
      tokens,
      buildMessagePayload({
        type: 'pending_financial_message',
        title: `Review ${pending.kind}`,
        body: notifBody,
        householdId: credential.householdId,
        deepLink: '/pending',
      }),
    ).catch((error) => console.error('Could not send pending-message notification', error));
    response.status(202).json({ accepted: true, pendingId: receiptId, kind: pending.kind });
  },
);

export const approvePendingFinancialMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as {
    householdId?: unknown;
    pendingId?: unknown;
    categoryId?: unknown;
    accountId?: unknown;
    destinationAccountId?: unknown;
    convertedAmount?: unknown;
  };
  const householdId = assertString(data.householdId, 'householdId');
  const pendingId = assertString(data.pendingId, 'pendingId');
  const categoryId = typeof data.categoryId === 'string' ? data.categoryId.trim() : '';
  const accountId = assertString(data.accountId, 'accountId');
  const destinationAccountId = typeof data.destinationAccountId === 'string' ? data.destinationAccountId.trim() : '';
  const convertedAmountRaw = (request.data as { convertedAmount?: unknown }).convertedAmount;
  const convertedAmount = typeof convertedAmountRaw === 'number' && Number.isFinite(convertedAmountRaw) && convertedAmountRaw > 0
    ? convertedAmountRaw
    : null;
  const profile = await requireHouseholdMember(uid, householdId);
  const db = getFirestore();
  const pendingRef = db.doc(`households/${householdId}/pendingFinancialMessages/${pendingId}`);
  const transactionId = `import_${pendingId}`;
  const transactionRef = db.doc(`households/${householdId}/transactions/${transactionId}`);

  const cycleSnapshot = await db.collection(`households/${householdId}/budgetCycles`)
    .where('status', '==', 'open').limit(1).get();
  const activeCycleId = cycleSnapshot.empty ? null : cycleSnapshot.docs[0].id;

  const pendingBeforeApproval = await pendingRef.get();
  if (!pendingBeforeApproval.exists) throw new HttpsError('not-found', 'Pending item not found.');
  const pendingForLoanCheck = pendingBeforeApproval.data() as PendingFinancialMessage;
  const suggestedLoanId = pendingForLoanCheck.suggestedLoanId ?? '';
  const suggestedInstallment = pendingForLoanCheck.suggestedLoanInstallmentNumber ?? null;
  let existingLoanPayments: FinanceTransaction[] = [];
  if (suggestedLoanId && suggestedInstallment) {
    const loanTransactionsSnapshot = await db.collection(`households/${householdId}/transactions`)
      .where('loanId', '==', suggestedLoanId).get();
    existingLoanPayments = loanTransactionsSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }) as FinanceTransaction)
      .filter((existing) => existing.status === 'posted');
    if (existingLoanPayments.some((existing) => existing.loanInstallmentNumber === suggestedInstallment)) {
      throw new HttpsError('already-exists', 'This loan installment is already recorded.');
    }
  }

  await db.runTransaction(async (transaction) => {
    const loanRef = suggestedLoanId ? db.doc(`households/${householdId}/loans/${suggestedLoanId}`) : null;
    const paymentLockRef = suggestedLoanId && suggestedInstallment
      ? db.doc(`households/${householdId}/loanPaymentLocks/${suggestedLoanId}_${suggestedInstallment}`)
      : null;
    const [pendingSnapshot, accountSnapshot, existingTransaction, loanSnapshot, paymentLockSnapshot] = await Promise.all([
      transaction.get(pendingRef),
      transaction.get(db.doc(`households/${householdId}/accounts/${accountId}`)),
      transaction.get(transactionRef),
      loanRef ? transaction.get(loanRef) : Promise.resolve(null),
      paymentLockRef ? transaction.get(paymentLockRef) : Promise.resolve(null),
    ]);
    if (existingTransaction.exists) return;
    if (!pendingSnapshot.exists) throw new HttpsError('not-found', 'Pending item not found.');
    const pending = pendingSnapshot.data() as PendingFinancialMessage;
    const account = accountSnapshot.data() as Account | undefined;
    const loan = loanSnapshot?.data() as Loan | undefined;
    const isLoanPayment = !!suggestedLoanId && !!suggestedInstallment;
    if (isLoanPayment) {
      const expectedInstallment = (loan?.openingPaidInstallments ?? 0) + existingLoanPayments.length + 1;
      if (pending.suggestedLoanId !== suggestedLoanId
        || pending.suggestedLoanInstallmentNumber !== suggestedInstallment
        || !loan || loan.status !== 'active'
        || loan.paymentAccountId !== accountId
        || loan.currency !== pending.currency
        || Math.abs(loan.installmentAmount - pending.amount) > 0.01
        || expectedInstallment !== suggestedInstallment
        || daysBetween(pending.date, installmentDate(loan, suggestedInstallment)) > Math.max(3, (loan.graceDay ?? loan.dueDay) - loan.dueDay + 2)) {
        throw new HttpsError('failed-precondition', 'The suggested loan no longer matches this payment.');
      }
      if (paymentLockSnapshot?.exists) throw new HttpsError('already-exists', 'This loan installment is already recorded.');
    } else if (pending.kind !== 'transfer') {
      if (!categoryId) throw new HttpsError('invalid-argument', 'Category is required.');
      const categorySnapshot = await transaction.get(db.doc(`households/${householdId}/categories/${categoryId}`));
      const category = categorySnapshot.data() as Category | undefined;
      if (!category?.isActive) throw new HttpsError('failed-precondition', 'Choose an active category.');
      if (category.type !== pending.kind) {
        throw new HttpsError('failed-precondition', `Choose an ${pending.kind} category.`);
      }
    }
    const conversionRequired = !!pending.conversionRequired;
    if (conversionRequired) {
      if (convertedAmount == null) {
        throw new HttpsError('invalid-argument', 'Enter the amount in the card account currency to approve this charge.');
      }
      if (!(pending.amount > 0)) {
        throw new HttpsError('invalid-argument', 'This message has no parsable original amount.');
      }
      if (pending.suggestedAccountId && accountId !== pending.suggestedAccountId) {
        throw new HttpsError('failed-precondition', 'Foreign-currency card charges must be approved against the linked card account.');
      }
    }
    if (!account?.isActive || (!conversionRequired && account.currency !== pending.currency)) {
      throw new HttpsError('failed-precondition', 'Choose an active account in the message currency.');
    }

    let destinationAccount: Account | undefined;
    if (pending.kind === 'transfer') {
      if (!destinationAccountId) throw new HttpsError('invalid-argument', 'Destination account is required.');
      const destinationSnapshot = await transaction.get(db.doc(`households/${householdId}/accounts/${destinationAccountId}`));
      destinationAccount = destinationSnapshot.data() as Account | undefined;
      const expectedDestCurrency = pending.destinationCurrency ?? pending.currency;
      if (!destinationAccount?.isActive || destinationAccount.currency !== expectedDestCurrency || destinationAccount.id === account.id) {
        throw new HttpsError('failed-precondition', `Choose a different active destination account in ${expectedDestCurrency}.`);
      }
    }

    const isCrossCurrency = pending.kind === 'transfer'
      && !!pending.destinationCurrency
      && pending.destinationCurrency !== pending.currency;
    const destAmount = isCrossCurrency ? (pending.destinationAmount ?? pending.amount) : pending.amount;
    const destCurrency = isCrossCurrency ? (pending.destinationCurrency as string) : pending.currency;

    const settled = settledAmounts(pending.amount, pending.currency, conversionRequired ? convertedAmount : null, account!.currency);

    const now = new Date().toISOString();
    transaction.create(transactionRef, {
      id: transactionId,
      householdId,
      type: pending.kind,
      date: pending.date,
      description: pending.description,
      categoryId: categoryId || null,
      budgetCycleId: activeCycleId,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      status: 'posted',
      loanId: isLoanPayment ? suggestedLoanId : null,
      loanInstallmentNumber: isLoanPayment ? suggestedInstallment : null,
      originalCharge: settled.originalCharge,
      importedFrom: { kind: 'financial-message', pendingId, provider: pending.provider, source: pending.source },
    });
    transaction.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_source`), {
      id: `${transactionId}_source`, householdId, transactionId, accountId,
      signedAmount: pending.kind === 'income' ? settled.amount : -settled.amount,
      currency: settled.currency, createdAt: now,
    });
    if (pending.kind === 'transfer' && destinationAccount) {
      transaction.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_destination`), {
        id: `${transactionId}_destination`, householdId, transactionId,
        accountId: destinationAccount.id, signedAmount: destAmount,
        currency: destCurrency, createdAt: now,
      });
      if (isCrossCurrency && pending.destinationAmount) {
        transaction.create(db.doc(`households/${householdId}/conversionDetails/${transactionId}`), {
          transactionId,
          fromCurrency: pending.currency,
          toCurrency: destCurrency,
          fromAmount: pending.amount,
          toAmount: pending.destinationAmount,
          effectiveRate: pending.destinationAmount / pending.amount,
          rateSource: 'bank',
        });
      }
    }
    if (isLoanPayment && paymentLockRef && loan) {
      transaction.create(paymentLockRef, { loanId: suggestedLoanId, installmentNumber: suggestedInstallment, transactionId, createdAt: now });
      if (suggestedInstallment >= loan.totalInstallments) transaction.set(loanRef!, { status: 'paid', updatedAt: now }, { merge: true });
    }
    transaction.create(db.doc(`households/${householdId}/auditLog/${transactionId}`), {
      id: transactionId,
      householdId,
      userId: uid,
      userDisplayName: profile.displayName || 'User',
      userPhotoURL: profile.photoURL ?? null,
      action: isLoanPayment ? 'loan_payment_recorded' : 'transaction_created',
      summary: isLoanPayment
        ? `${profile.displayName || 'User'} approved imported loan installment ${suggestedInstallment}/${loan?.totalInstallments}: ${settled.amount} ${settled.currency}`
        : settled.originalCharge
        ? `${profile.displayName || 'User'} approved imported ${pending.kind}: ${settled.amount} ${settled.currency} (from ${pending.amount} ${pending.currency}) - ${pending.description}`
        : isCrossCurrency
        ? `${profile.displayName || 'User'} approved imported transfer: ${pending.amount} ${pending.currency} → ${destAmount} ${destCurrency} - ${pending.description}`
        : `${profile.displayName || 'User'} approved imported ${pending.kind}: ${pending.amount} ${pending.currency} - ${pending.description}`,
      details: { transactionId, type: pending.kind, amount: pending.amount, currency: pending.currency, imported: true },
      createdAt: now,
    });
    transaction.set(db.doc(`messageIngestionReceipts/${pendingId}`), {
      state: 'approved',
      transactionId,
      snapshot: pending,
      resolvedAt: now,
      resolvedBy: uid,
      resolvedByDisplayName: profile.displayName || 'User',
      updatedAt: now,
    }, { merge: true });
    transaction.delete(pendingRef);
  });

  return { transactionId };
});

export const discardPendingFinancialMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = assertString((request.data as { householdId?: unknown })?.householdId, 'householdId');
  const pendingId = assertString((request.data as { pendingId?: unknown })?.pendingId, 'pendingId');
  const profile = await requireHouseholdMember(uid, householdId);
  const db = getFirestore();
  const pendingRef = db.doc(`households/${householdId}/pendingFinancialMessages/${pendingId}`);
  await db.runTransaction(async (transaction) => {
    const pendingSnapshot = await transaction.get(pendingRef);
    if (!pendingSnapshot.exists) return;
    const pending = pendingSnapshot.data() as PendingFinancialMessage;
    const now = new Date().toISOString();
    const auditId = `pending_discarded_${pendingId}_${Date.now()}`;
    transaction.delete(pendingRef);
    transaction.set(db.doc(`messageIngestionReceipts/${pendingId}`), {
      state: 'discarded',
      snapshot: pending,
      resolvedAt: now,
      resolvedBy: uid,
      resolvedByDisplayName: profile.displayName || 'User',
      updatedAt: now,
      rawMessage: FieldValue.delete(),
    }, { merge: true });
    transaction.create(db.doc(`households/${householdId}/auditLog/${auditId}`), {
      id: auditId,
      householdId,
      userId: uid,
      userDisplayName: profile.displayName || 'User',
      userPhotoURL: profile.photoURL ?? null,
      action: 'pending_message_discarded',
      summary: `${profile.displayName || 'User'} discarded imported ${pending.kind}: ${pending.amount} ${pending.currency} - ${pending.description}`,
      details: { pendingId, type: pending.kind, amount: pending.amount, currency: pending.currency },
      createdAt: now,
    });
  });
  return { discarded: true };
});

export const listResolvedPendingFinancialMessages = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = assertString((request.data as { householdId?: unknown })?.householdId, 'householdId');
  await requireHouseholdMember(uid, householdId);

  const snapshot = await getFirestore().collection('messageIngestionReceipts')
    .where('householdId', '==', householdId)
    .where('state', 'in', ['approved', 'discarded'])
    .orderBy('resolvedAt', 'desc')
    .limit(100)
    .get();
  const items = snapshot.docs
    .map((doc) => doc.data() as IngestionReceipt)
    .filter((receipt) => (receipt.state === 'approved' || receipt.state === 'discarded')
      && !!receipt.snapshot
      && !!receipt.resolvedAt
      && !!receipt.resolvedBy)
    .map((receipt) => ({
      id: receipt.id,
      state: receipt.state as 'approved' | 'discarded',
      snapshot: receipt.snapshot as PendingFinancialMessage,
      transactionId: receipt.transactionId ?? null,
      resolvedAt: receipt.resolvedAt as string,
      resolvedBy: receipt.resolvedBy as string,
      resolvedByDisplayName: receipt.resolvedByDisplayName || 'User',
    }));
  return { items };
});

export const restoreDiscardedPendingFinancialMessage = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = assertString((request.data as { householdId?: unknown })?.householdId, 'householdId');
  const pendingId = assertString((request.data as { pendingId?: unknown })?.pendingId, 'pendingId');
  const profile = await requireHouseholdMember(uid, householdId);
  const db = getFirestore();
  const receiptRef = db.doc(`messageIngestionReceipts/${pendingId}`);
  const pendingRef = db.doc(`households/${householdId}/pendingFinancialMessages/${pendingId}`);

  let restored: PendingFinancialMessage | null = null;
  await db.runTransaction(async (transaction) => {
    const [receiptSnapshot, existingPending] = await Promise.all([
      transaction.get(receiptRef),
      transaction.get(pendingRef),
    ]);
    const receipt = receiptSnapshot.data() as IngestionReceipt | undefined;
    if (!receipt || receipt.householdId !== householdId) throw new HttpsError('not-found', 'Discarded item not found.');
    if (receipt.state !== 'discarded' || !receipt.snapshot) {
      throw new HttpsError('failed-precondition', 'Only discarded items can be restored.');
    }
    if (existingPending.exists) throw new HttpsError('already-exists', 'This item is already pending.');

    const now = new Date().toISOString();
    const auditId = `pending_restored_${pendingId}_${Date.now()}`;
    restored = { ...receipt.snapshot, id: pendingId, householdId, status: 'pending' };
    transaction.create(pendingRef, restored);
    transaction.set(receiptRef, {
      state: 'pending',
      transactionId: FieldValue.delete(),
      resolvedAt: FieldValue.delete(),
      resolvedBy: FieldValue.delete(),
      resolvedByDisplayName: FieldValue.delete(),
      updatedAt: now,
    }, { merge: true });
    transaction.create(db.doc(`households/${householdId}/auditLog/${auditId}`), {
      id: auditId,
      householdId,
      userId: uid,
      userDisplayName: profile.displayName || 'User',
      userPhotoURL: profile.photoURL ?? null,
      action: 'pending_message_restored',
      summary: `${profile.displayName || 'User'} restored discarded imported ${receipt.snapshot.kind}: ${receipt.snapshot.amount} ${receipt.snapshot.currency} - ${receipt.snapshot.description}`,
      details: { pendingId },
      createdAt: now,
    });
  });
  return { item: restored };
});
