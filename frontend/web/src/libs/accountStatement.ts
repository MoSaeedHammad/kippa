import type { FinanceTransaction, LedgerLine, TransactionType } from '@kippa/domain';

export interface AccountStatementEntry {
  transaction: FinanceTransaction;
  amount: number;
  balance: number;
}

export interface AccountStatementFilters {
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  type?: TransactionType;
}

function compareTransactions(a: FinanceTransaction, b: FinanceTransaction) {
  return a.date.localeCompare(b.date)
    || (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
    || a.id.localeCompare(b.id);
}

/**
 * Builds a statement for one account. Balances are calculated from every posted
 * entry before presentation filters are applied, so filtered rows retain their
 * true historical running balance.
 */
export function buildAccountStatement(
  accountId: string,
  transactions: FinanceTransaction[],
  ledgerLines: LedgerLine[],
  filters: AccountStatementFilters = {},
): AccountStatementEntry[] {
  const transactionById = new Map(
    transactions.filter(transaction => transaction.status === 'posted').map(transaction => [transaction.id, transaction]),
  );
  const amountByTransaction = new Map<string, number>();

  ledgerLines.forEach(line => {
    if (line.accountId !== accountId || !transactionById.has(line.transactionId)) return;
    amountByTransaction.set(line.transactionId, (amountByTransaction.get(line.transactionId) ?? 0) + line.signedAmount);
  });

  let balance = 0;
  const allEntries = Array.from(amountByTransaction.entries())
    .map(([transactionId, amount]) => ({ transaction: transactionById.get(transactionId)!, amount }))
    .sort((a, b) => compareTransactions(a.transaction, b.transaction))
    .map(({ transaction, amount }) => {
      balance += amount;
      return { transaction, amount, balance };
    });

  const search = filters.search?.trim().toLowerCase();
  return allEntries
    .filter(({ transaction }) => {
      if (filters.dateFrom && transaction.date < filters.dateFrom) return false;
      if (filters.dateTo && transaction.date > filters.dateTo) return false;
      if (filters.type && transaction.type !== filters.type) return false;
      if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
      if (search && !(transaction.description ?? '').toLowerCase().includes(search)) return false;
      return true;
    })
    .reverse();
}

export function calculateStatementOpeningBalance(
  accountId: string,
  dateFrom: string,
  transactions: FinanceTransaction[],
  ledgerLines: LedgerLine[],
) {
  const eligibleTransactionIds = new Set(
    transactions
      .filter(transaction => transaction.status === 'posted' && transaction.date < dateFrom)
      .map(transaction => transaction.id),
  );
  return ledgerLines
    .filter(line => line.accountId === accountId && eligibleTransactionIds.has(line.transactionId))
    .reduce((total, line) => total + line.signedAmount, 0);
}
