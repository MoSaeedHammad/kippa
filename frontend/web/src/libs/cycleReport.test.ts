import type { Account, BudgetAllocation, BudgetCycle, Category, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { describe, expect, it } from 'vitest';
import { calculateCycleReport } from './cycleReport';

const cycle: BudgetCycle = { id: 'c1', householdId: 'h', name: 'April', startDate: '2026-04-01', endDate: '2026-04-30', status: 'closed' };
const account = (id: string, currency = 'EGP', isActive = true): Account => ({ id, householdId: 'h', name: id, type: 'running', currency, isActive, sortOrder: 0, createdAt: '' });
const transaction = (id: string, type: FinanceTransaction['type'], date: string, budgetCycleId: string | null = 'c1', status: FinanceTransaction['status'] = 'posted', categoryId: string | null = null): FinanceTransaction => ({ id, householdId: 'h', type, date, budgetCycleId, categoryId, status, createdBy: 'u', createdAt: '', updatedAt: '' });
const line = (id: string, transactionId: string, accountId: string, signedAmount: number, currency = 'EGP'): LedgerLine => ({ id, householdId: 'h', transactionId, accountId, signedAmount, currency, createdAt: '' });
const allocation = (categoryId: string, plannedAmount: number, currency = 'EGP'): BudgetAllocation => ({ id: `${categoryId}-a`, householdId: 'h', budgetCycleId: 'c1', categoryId, plannedAmount, currency, carryLeftover: false });
const category = (id: string, name: string): Category => ({ id, householdId: 'h', name, type: 'expense', isActive: true, createdAt: '' });
const report = (accounts: Account[], transactions: FinanceTransaction[], lines: LedgerLine[], allocations: BudgetAllocation[] = [], categories: Category[] = [], rates: Record<string, number> = {}) => calculateCycleReport(cycle, accounts, categories, transactions, lines, allocations, 'EGP', rates);

describe('calculateCycleReport', () => {
  it('excludes voided transactions and calculates opening and closing balances', () => {
    const a = account('bank');
    const transactions = [transaction('old', 'income', '2026-03-20', null), transaction('in', 'income', '2026-04-02'), transaction('void', 'income', '2026-04-03', 'c1', 'voided')];
    const result = report([a], transactions, [line('l1', 'old', 'bank', 100), line('l2', 'in', 'bank', 50), line('l3', 'void', 'bank', 999)]);
    expect(result.openingBalance).toBe(100);
    expect(result.closingBalance).toBe(150);
    expect(result.totalIncome).toBe(50);
  });

  it('does not count a backdated cycle transaction in both opening and cycle activity', () => {
    const result = report([account('bank')], [transaction('backdated', 'income', '2026-03-31')], [line('l1', 'backdated', 'bank', 75)]);
    expect(result.openingBalance).toBe(0);
    expect(result.closingBalance).toBe(75);
    expect(result.totalIncome).toBe(75);
  });

  it('excludes transfers from income and spending but keeps their account activity', () => {
    const transactions = [transaction('t', 'transfer', '2026-04-03')];
    const result = report([account('a'), account('b')], transactions, [line('l1', 't', 'a', -20), line('l2', 't', 'b', 20)]);
    expect(result.totalIncome).toBe(0);
    expect(result.totalSpending).toBe(0);
    expect(result.accounts.map(item => item.transactionCount)).toEqual([1, 1]);
  });

  it('groups category spending, planned allocations, and per-account counts', () => {
    const transactions = [transaction('e1', 'expense', '2026-04-03', 'c1', 'posted', 'food'), transaction('e2', 'expense', '2026-04-04')];
    const result = report([account('bank')], transactions, [line('l1', 'e1', 'bank', -30), line('l2', 'e1', 'bank', -5), line('l3', 'e2', 'bank', -10)], [allocation('food', 50)], [category('food', 'Food')]);
    expect(result.accounts[0].transactionCount).toBe(2);
    expect(result.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ categoryId: 'food', categoryName: 'Food', planned: 50, spent: 35, variance: 15 }),
      expect.objectContaining({ categoryId: null, categoryName: 'Uncategorized', spent: 10 }),
    ]));
    expect(result.categories.find(item => item.categoryId === 'food')?.share).toBeCloseTo(35 / 45);
  });

  it('groups loan expenses under loan payments instead of uncategorized', () => {
    const loanExpense = { ...transaction('loan', 'expense', '2026-04-10'), loanId: 'loan-1' };
    const result = report([account('bank')], [loanExpense], [line('l1', 'loan', 'bank', -250)]);
    expect(result.categories).toEqual([
      expect.objectContaining({ categoryId: '__loan_payments__', categoryName: 'Loan payments', spent: 250 }),
    ]);
  });

  it('converts multi-currency household totals and safely handles zero income', () => {
    const result = report([account('usd', 'USD')], [transaction('e', 'expense', '2026-04-03')], [line('l', 'e', 'usd', -10, 'USD')], [], [], { USD: 2 });
    expect(result.totalSpending).toBe(20);
    expect(result.closingBalance).toBe(-20);
    expect(result.savingsRate).toBe(0);
  });
});
