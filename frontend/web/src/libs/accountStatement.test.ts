import { describe, expect, it } from 'vitest';
import type { FinanceTransaction, LedgerLine } from '@kippa/domain';
import { buildAccountStatement, calculateStatementOpeningBalance } from './accountStatement';

const transactions = [
  { id: 'opening', date: '2026-08-01', createdAt: '2026-08-01T08:00:00Z', status: 'posted', type: 'adjustment', description: 'Opening balance' },
  { id: 'salary', date: '2026-08-03', createdAt: '2026-08-03T08:00:00Z', status: 'posted', type: 'income', description: 'Salary' },
  { id: 'groceries', date: '2026-08-04', createdAt: '2026-08-04T08:00:00Z', status: 'posted', type: 'expense', description: 'Groceries', categoryId: 'food' },
  { id: 'voided', date: '2026-08-05', createdAt: '2026-08-05T08:00:00Z', status: 'voided', type: 'expense', description: 'Voided expense' },
] as FinanceTransaction[];

const lines = [
  { transactionId: 'opening', accountId: 'bank', signedAmount: 10_000 },
  { transactionId: 'salary', accountId: 'bank', signedAmount: 5_000 },
  { transactionId: 'groceries', accountId: 'bank', signedAmount: -600 },
  { transactionId: 'groceries', accountId: 'cash', signedAmount: 600 },
  { transactionId: 'voided', accountId: 'bank', signedAmount: -300 },
] as LedgerLine[];

describe('buildAccountStatement', () => {
  it('returns newest first with a running balance for the selected account', () => {
    expect(buildAccountStatement('bank', transactions, lines).map(entry => ({
      id: entry.transaction.id,
      amount: entry.amount,
      balance: entry.balance,
    }))).toEqual([
      { id: 'groceries', amount: -600, balance: 14_400 },
      { id: 'salary', amount: 5_000, balance: 15_000 },
      { id: 'opening', amount: 10_000, balance: 10_000 },
    ]);
  });

  it('preserves the real balance when filters hide earlier transactions', () => {
    const [expense] = buildAccountStatement('bank', transactions, lines, { type: 'expense' });
    expect(expense.transaction.id).toBe('groceries');
    expect(expense.balance).toBe(14_400);
  });

  it('supports inclusive date, category, and search filters', () => {
    expect(buildAccountStatement('bank', transactions, lines, {
      categoryId: 'food',
      dateFrom: '2026-08-04',
      dateTo: '2026-08-04',
      search: 'grocer',
    }).map(entry => entry.transaction.id)).toEqual(['groceries']);
  });

  it('calculates the balance brought forward before a selected start date', () => {
    expect(calculateStatementOpeningBalance('bank', '2026-08-04', transactions, lines)).toBe(15_000);
  });

  it('uses creation time to produce deterministic balances for transactions on the same date', () => {
    const sameDayTransactions = [
      { id: 'later', date: '2026-08-06', createdAt: '2026-08-06T12:00:00Z', status: 'posted', type: 'expense' },
      { id: 'earlier', date: '2026-08-06', createdAt: '2026-08-06T08:00:00Z', status: 'posted', type: 'income' },
    ] as FinanceTransaction[];
    const sameDayLines = [
      { transactionId: 'later', accountId: 'bank', signedAmount: -25 },
      { transactionId: 'earlier', accountId: 'bank', signedAmount: 100 },
    ] as LedgerLine[];

    expect(buildAccountStatement('bank', sameDayTransactions, sameDayLines).map(entry => ({ id: entry.transaction.id, balance: entry.balance }))).toEqual([
      { id: 'later', balance: 75 },
      { id: 'earlier', balance: 100 },
    ]);
  });
});
