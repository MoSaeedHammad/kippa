import { dbLib } from '@/libs/db';
import { transactionsLib } from '@/libs/transactions';
import { auditLogLib } from '@/libs/auditLog';
import { Account, Card, CardStatement, CardStatementStatus, FinanceTransaction, LedgerLine } from '@kippa/domain';

type AuditUser = { uid: string; displayName: string; photoURL?: string };

export type CardInput = Omit<Card, 'id' | 'householdId' | 'createdAt'>;

/**
 * Validates a card against the rules in the spec §9. Throws on violation.
 * Pure function — safe to unit test without Firestore.
 */
export function validateCardInput(card: CardInput, accounts: Account[]): void {
  if (!card.bankId) {
    throw new Error('bankId is required.');
  }

  if (!card.parentAccountId) {
    throw new Error('parentAccountId is required (no card without an account).');
  }
  const parent = accounts.find(a => a.id === card.parentAccountId);
  if (!parent) throw new Error('parentAccountId does not reference a real account.');

  if (card.kind === 'debit') {
    if (parent.type !== 'running' && parent.type !== 'savings') {
      throw new Error('A debit card must link to a running or savings account.');
    }
  } else {
    // credit
    if (parent.type !== 'credit') {
      throw new Error('A credit card must link to a credit account.');
    }
    if (card.creditLimit == null) throw new Error('creditLimit is required for a credit card.');
    if (!card.paymentAccountId) throw new Error('paymentAccountId is required for a credit card.');
    const payAcc = accounts.find(a => a.id === card.paymentAccountId);
    if (!payAcc) throw new Error('paymentAccountId does not reference a real account.');
    if (payAcc.currency !== card.currency) {
      throw new Error('Card currency must equal the payment account currency.');
    }
  }

  if (card.last4 && card.last4.length > 4) {
    throw new Error('last4 must be at most 4 characters.');
  }
  if (card.expiryMonth != null && (card.expiryMonth < 1 || card.expiryMonth > 12)) {
    throw new Error('expiryMonth must be 1–12.');
  }
}

/**
 * Pure status computation per spec §9 rule 5 + §9.1 overpayment cap.
 */
export function computeStatementStatus(statement: CardStatement, totalPaid: number): CardStatementStatus {
  if (totalPaid <= 0) return 'pending';
  if (totalPaid >= statement.statementBalance) return 'paid';
  return 'partial';
}

export const cardsLib = {
  async getCards(householdId: string): Promise<Card[]> {
    const list = await dbLib.getDocs(householdId, 'cards');
    return (list as Card[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async getStatements(householdId: string, cardId?: string): Promise<CardStatement[]> {
    const filters = cardId ? [{ field: 'cardId', op: '==' as const, value: cardId }] : undefined;
    const list = await dbLib.getDocs(householdId, 'cardStatements', filters);
    return (list as CardStatement[]).sort((a, b) => b.statementDate.localeCompare(a.statementDate));
  },

  /**
   * Creates a debit card. No new account needed — links to an existing one.
   */
  async createDebitCard(householdId: string, card: CardInput, accounts: Account[], auditUser?: AuditUser): Promise<string> {
    if (card.kind !== 'debit') throw new Error('Use createCreditCard for credit cards.');
    validateCardInput(card, accounts);
    const id = crypto.randomUUID();
    const newCard: Card = { ...card, id, householdId, createdAt: new Date().toISOString() };
    await dbLib.setDoc(householdId, 'cards', id, newCard);
    if (auditUser) {
      auditLogLib.logAction(householdId, auditUser, 'account_created',
        `${auditUser.displayName} added debit card: ${newCard.name}`,
        { cardId: id, kind: 'debit' });
    }
    return id;
  },

  /**
   * Creates a credit card AND its credit account in one batch (spec §8.3).
   * Returns { cardId, creditAccountId }.
   */
  async createCreditCard(
    householdId: string,
    card: CardInput,
    accounts: Account[],
    sortOrder: number,
    auditUser?: AuditUser
  ): Promise<{ cardId: string; creditAccountId: string }> {
    // First create the credit account (the debt bucket), then validate + link.
    const creditAccountId = crypto.randomUUID();
    const creditAccount: Account = {
      id: creditAccountId,
      householdId,
      name: `${card.name} Debt`,
      type: 'credit',
      currency: card.currency,
      isActive: true,
      sortOrder,
      createdAt: new Date().toISOString(),
    };
    // Validate with the new credit account present.
    validateCardInput({ ...card, parentAccountId: creditAccountId }, [...accounts, creditAccount]);

    const cardId = crypto.randomUUID();
    const newCard: Card = {
      ...card, parentAccountId: creditAccountId, id: cardId,
      householdId, createdAt: new Date().toISOString(),
    };

    await dbLib.executeBatch(householdId, [
      { type: 'set', collectionName: 'accounts', docId: creditAccountId, data: creditAccount },
      { type: 'set', collectionName: 'cards', docId: cardId, data: newCard },
    ]);

    if (auditUser) {
      auditLogLib.logAction(householdId, auditUser, 'account_created',
        `${auditUser.displayName} added credit card: ${newCard.name}`,
        { cardId, creditAccountId, kind: 'credit' });
    }
    return { cardId, creditAccountId };
  },

  async updateCard(householdId: string, cardId: string, updates: Partial<Card>, accounts: Account[], auditUser?: AuditUser): Promise<void> {
    const existing = (await dbLib.getDoc(householdId, 'cards', cardId)) as Card | null;
    if (!existing) throw new Error('Card not found');
    const merged: Card = { ...existing, ...updates };
    validateCardInput(merged, accounts);
    await dbLib.setDoc(householdId, 'cards', cardId, merged);
    if (auditUser) {
      auditLogLib.logAction(householdId, auditUser, 'account_updated',
        `${auditUser.displayName} updated card: ${merged.name}`, { cardId });
    }
  },

  /**
   * Pay the card — creates a transfer paymentAccount → creditAccount.
   * No statement required. Works for any amount (a single charge, several, or all).
   * The optional fee is included in amount and recorded as a separate expense
   * atomically with the payment, so it does not create a false credit balance.
   *
   * `settlesChargeIds` (optional) records which expense transaction(s) this
   * payment settles, so the UI can mark those charges as paid exactly instead
   * of guessing via FIFO allocation.
   *
   * `budgetCycleId` (optional) tags the transfer with the active cycle so it
   * appears in the cycle-filtered "View All" transactions page. Other transfer
   * entry points (FastEntry) set this; card payments must too.
   *
   * `settlesDescriptions` (optional) — names of the settled charge(s) (e.g.
   * "Netflix", "Apple Music"). When provided, the transfer description names
   * what was paid instead of the generic "Card payment — <card>" label, so the
   * user can identify it in the transaction list.
   */
  async payCard(
    householdId: string,
    card: Card,
    amount: number,
    auditUser?: AuditUser,
    settlesChargeIds?: string[],
    budgetCycleId?: string | null,
    settlesDescriptions?: string[],
    fee?: { amount: number; rate: number }
  ): Promise<string> {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be a finite number greater than 0.');
    if (fee && (!Number.isFinite(fee.amount) || fee.amount < 0)) {
      throw new Error('Card fee amount must be a finite number greater than or equal to 0.');
    }
    if (fee && (!Number.isFinite(fee.rate) || fee.rate < 0 || fee.rate > 100)) {
      throw new Error('Card fee rate must be a finite number between 0 and 100.');
    }
    if (fee && fee.amount >= amount) {
      throw new Error('Card fee amount must be less than the total payment amount.');
    }
    if (!card.paymentAccountId) throw new Error('Card has no paymentAccountId.');

    // Build a human-readable description: name the charge(s) when we know them.
    // e.g. "Card payment — Netflix", "Card payment — Netflix +2 more", or the
    // generic "Card payment — HSBC Credit Card" fallback for legacy callers.
    let description = `Card payment — ${card.name}`;
    if (settlesDescriptions && settlesDescriptions.length > 0) {
      const first = settlesDescriptions[0];
      const extra = settlesDescriptions.length - 1;
      const named = extra > 0 ? `${first} +${extra} more` : first;
      description = `Card payment — ${named}`;
    }

    if (!fee) {
      return transactionsLib.createTransaction(
        householdId,
        {
          type: 'transfer',
          date: new Date().toISOString().slice(0, 10),
          description,
          createdBy: auditUser?.uid ?? 'system',
          budgetCycleId: budgetCycleId ?? null,
          settlesChargeIds: settlesChargeIds && settlesChargeIds.length > 0 ? settlesChargeIds : null,
        },
        [
          { accountId: card.paymentAccountId, signedAmount: -amount, currency: card.currency },
          { accountId: card.parentAccountId, signedAmount: amount, currency: card.currency },
        ],
        undefined,
        auditUser
      );
    }

    if (settlesChargeIds && settlesChargeIds.length > 0) {
      const [rawTransactions, rawLines] = await Promise.all([
        dbLib.getDocs(householdId, 'transactions'),
        dbLib.getDocs(householdId, 'ledgerLines'),
      ]);
      const transactionById = new Map((rawTransactions as FinanceTransaction[]).map(transaction => [transaction.id, transaction]));
      const linesByTransaction = new Map<string, LedgerLine[]>();
      (rawLines as LedgerLine[]).forEach(line => {
        const lines = linesByTransaction.get(line.transactionId) ?? [];
        lines.push(line);
        linesByTransaction.set(line.transactionId, lines);
      });
      const selectedIds = [...new Set(settlesChargeIds)];
      const selectedLines = selectedIds.map((chargeId) => {
        const transaction = transactionById.get(chargeId);
        const line = linesByTransaction.get(chargeId)?.find(candidate =>
          candidate.accountId === card.parentAccountId && candidate.signedAmount < 0
        );
        if (!transaction || transaction.status !== 'posted' || !line ||
          line.currency !== card.currency || !Number.isFinite(line.signedAmount) ||
          (line.cardFee && (!Number.isFinite(line.cardFee.baseAmount) || line.cardFee.baseAmount < 0))) {
          throw new Error(`Selected card charge not found or invalid: ${chargeId}`);
        }
        return { transaction, line, baseCents: Math.round((line.cardFee?.baseAmount ?? Math.abs(line.signedAmount)) * 100) };
      });
      const baseTotalCents = Math.round((amount - fee.amount) * 100);
      const originalBaseTotalCents = selectedLines.reduce((total, selected) => total + selected.baseCents, 0);
      if (originalBaseTotalCents <= 0 || baseTotalCents < 0) {
        throw new Error('Selected card charges have no valid base amount.');
      }
      const allocateCents = (totalCents: number): number[] => {
        let cumulativeBase = 0;
        let allocated = 0;
        return selectedLines.map(selected => {
          cumulativeBase += selected.baseCents;
          const target = Math.round(totalCents * cumulativeBase / originalBaseTotalCents);
          const share = target - allocated;
          allocated = target;
          return share;
        });
      };
      const baseAllocations = allocateCents(baseTotalCents);
      const feeAllocations = allocateCents(Math.round(fee.amount * 100));
      const nowStr = new Date().toISOString();
      const paymentTransactionId = crypto.randomUUID();
      const paymentTransaction = {
        id: paymentTransactionId,
        householdId,
        type: 'transfer' as const,
        date: nowStr.slice(0, 10),
        description,
        createdBy: auditUser?.uid ?? 'system',
        budgetCycleId: budgetCycleId ?? null,
        settlesChargeIds: selectedIds,
        createdAt: nowStr,
        updatedAt: nowStr,
        status: 'posted' as const,
      };
      const paymentLines = [
        { id: crypto.randomUUID(), householdId, transactionId: paymentTransactionId, accountId: card.paymentAccountId, signedAmount: -amount, currency: card.currency, createdAt: nowStr },
        { id: crypto.randomUUID(), householdId, transactionId: paymentTransactionId, accountId: card.parentAccountId, signedAmount: amount, currency: card.currency, createdAt: nowStr },
      ];
      await dbLib.executeBatch(householdId, [
        ...selectedLines.map((selected, index) => ({
          type: 'set' as const,
          collectionName: 'ledgerLines',
          docId: selected.line.id,
          data: {
            ...selected.line,
            signedAmount: -(baseAllocations[index] + feeAllocations[index]) / 100,
            cardFee: { baseAmount: baseAllocations[index] / 100, rate: fee.rate },
          },
        })),
        { type: 'set', collectionName: 'transactions', docId: paymentTransactionId, data: paymentTransaction },
        ...paymentLines.map(line => ({ type: 'set' as const, collectionName: 'ledgerLines', docId: line.id, data: line })),
      ]);
      if (auditUser) {
        auditLogLib.logAction(
          householdId,
          auditUser,
          'transaction_created',
          `${auditUser.displayName} logged transfer: ${amount} ${card.currency} — ${description}`,
          { transactionId: paymentTransactionId, type: 'transfer', amount, currency: card.currency }
        );
      }
      return paymentTransactionId;
    }

    if (fee.amount === 0) {
      return transactionsLib.createTransaction(
        householdId,
        {
          type: 'transfer',
          date: new Date().toISOString().slice(0, 10),
          description,
          createdBy: auditUser?.uid ?? 'system',
          budgetCycleId: budgetCycleId ?? null,
          settlesChargeIds: settlesChargeIds && settlesChargeIds.length > 0 ? settlesChargeIds : null,
        },
        [
          { accountId: card.paymentAccountId, signedAmount: -amount, currency: card.currency },
          { accountId: card.parentAccountId, signedAmount: amount, currency: card.currency },
        ],
        undefined,
        auditUser
      );
    }

    const nowStr = new Date().toISOString();
    const date = nowStr.slice(0, 10);
    const feeTransactionId = crypto.randomUUID();
    const feeLineId = crypto.randomUUID();
    const paymentTransactionId = crypto.randomUUID();
    const paymentLines = [
      { id: crypto.randomUUID(), householdId, transactionId: paymentTransactionId, accountId: card.paymentAccountId, signedAmount: -amount, currency: card.currency, createdAt: nowStr },
      { id: crypto.randomUUID(), householdId, transactionId: paymentTransactionId, accountId: card.parentAccountId, signedAmount: amount, currency: card.currency, createdAt: nowStr },
    ];
    const settledIds = [feeTransactionId, ...(settlesChargeIds ?? [])];
    const feeDescription = `Card fee (${fee.rate}%) — ${settlesDescriptions?.[0] ?? card.name}`;
    const feeTransaction = {
      id: feeTransactionId,
      householdId,
      type: 'expense' as const,
      date,
      description: feeDescription,
      categoryId: null,
      budgetCycleId: budgetCycleId ?? null,
      createdBy: auditUser?.uid ?? 'system',
      createdAt: nowStr,
      updatedAt: nowStr,
      status: 'posted' as const,
    };
    const paymentTransaction = {
      id: paymentTransactionId,
      householdId,
      type: 'transfer' as const,
      date,
      description,
      createdBy: auditUser?.uid ?? 'system',
      budgetCycleId: budgetCycleId ?? null,
      settlesChargeIds: settledIds,
      createdAt: nowStr,
      updatedAt: nowStr,
      status: 'posted' as const,
    };

    await dbLib.executeBatch(householdId, [
      { type: 'set', collectionName: 'transactions', docId: feeTransactionId, data: feeTransaction },
      { type: 'set', collectionName: 'ledgerLines', docId: feeLineId, data: {
        id: feeLineId,
        householdId,
        transactionId: feeTransactionId,
        accountId: card.parentAccountId,
        signedAmount: -fee.amount,
        currency: card.currency,
        createdAt: nowStr,
      } },
      { type: 'set', collectionName: 'transactions', docId: paymentTransactionId, data: paymentTransaction },
      ...paymentLines.map(line => ({ type: 'set' as const, collectionName: 'ledgerLines', docId: line.id, data: line })),
    ]);

    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'transaction_created',
        `${auditUser.displayName} logged expense: ${fee.amount} ${card.currency} — ${feeDescription}`,
        { transactionId: feeTransactionId, type: 'expense', amount: fee.amount, currency: card.currency }
      );
      auditLogLib.logAction(
        householdId,
        auditUser,
        'transaction_created',
        `${auditUser.displayName} logged transfer: ${amount} ${card.currency} — ${description}`,
        { transactionId: paymentTransactionId, type: 'transfer', amount, currency: card.currency }
      );
    }
    return paymentTransactionId;
  },

  /**
   * "Mark as paid" — legacy statement-linked payment (spec §6.1, §9.5 idempotency).
   * Kept for backward compatibility but the UI now uses payCard instead.
   */
  async markAsPaid(
    householdId: string,
    statement: CardStatement,
    card: Card,
    amount: number,
    auditUser?: AuditUser
  ): Promise<string> {
    if (statement.paymentTransactionId) {
      throw new Error('This statement already has a linked payment.');
    }
    if (!card.paymentAccountId) throw new Error('Card has no paymentAccountId.');
    const txId = await this.payCard(householdId, card, amount, auditUser);
    const status = computeStatementStatus(statement, amount);
    const updated: CardStatement = { ...statement, paymentTransactionId: txId, status };
    await dbLib.setDoc(householdId, 'cardStatements', statement.id, updated);
    return txId;
  },

  /**
   * Delete a statement — blocked if it has a linked payment (spec §9.5).
   */
  async deleteStatement(householdId: string, statementId: string): Promise<void> {
    const stmt = (await dbLib.getDoc(householdId, 'cardStatements', statementId)) as CardStatement | null;
    if (!stmt) throw new Error('Statement not found');
    if (stmt.paymentTransactionId) {
      throw new Error('This statement has a linked payment. Void or delete that payment first.');
    }
    await dbLib.executeBatch(householdId, [
      { type: 'delete', collectionName: 'cardStatements', docId: statementId },
    ]);
  },
};
