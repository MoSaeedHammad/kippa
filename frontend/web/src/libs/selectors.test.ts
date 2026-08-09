import { describe, it, expect } from 'vitest';
import { computeDashboard } from './selectors';
import type { Account, FinanceTransaction, LedgerLine, Loan } from '@kippa/domain';

const mkAccount = (id: string, currency: string, type: Account['type'] = 'running'): Account => ({
  id, householdId: 'h', name: id, type, currency, isActive: true, sortOrder: 1, createdAt: '',
});

const mkLine = (id: string, accId: string, amount: number, currency: string): LedgerLine => ({
  id, householdId: 'h', transactionId: id, accountId: accId, signedAmount: amount, currency, createdAt: '',
});

// A posted transaction that matches a ledger line's transactionId (line id == tx id in mkLine).
const mkTx = (id: string): FinanceTransaction => ({
  id, householdId: 'h', type: 'income', date: '2026-01-01', status: 'posted', createdBy: 'u', createdAt: '', updatedAt: '',
});

describe('computeDashboard (base-currency agnostic)', () => {
  it('sums same-currency balances directly into totalBaseEquivalent', () => {
    const accounts = [mkAccount('a1', 'SAR'), mkAccount('a2', 'SAR')];
    const lines = [mkLine('l1', 'a1', 1000, 'SAR'), mkLine('l2', 'a2', 500, 'SAR')];
    const txs = [mkTx('l1'), mkTx('l2')];
    const data = computeDashboard(accounts, txs, lines, [], null, [], [], {}, 'SAR');
    expect(data.totalBaseEquivalent).toBe(1500);
    expect(data.baseCurrency).toBe('SAR');
  });

  it('converts foreign-currency balances via displayRates', () => {
    const accounts = [mkAccount('a1', 'SAR'), mkAccount('a2', 'USD')];
    const lines = [mkLine('l1', 'a1', 1000, 'SAR'), mkLine('l2', 'a2', 100, 'USD')];
    const txs = [mkTx('l1'), mkTx('l2')];
    // USD→SAR rate = 3.75 (1 USD = 3.75 SAR). So 100 USD = 375 SAR.
    const data = computeDashboard(accounts, txs, lines, [], null, [], [], { USD: 3.75 }, 'SAR');
    expect(data.totalBaseEquivalent).toBe(1000 + 100 * 3.75);
  });

  it('uses rate of 1 for currencies missing from displayRates', () => {
    const accounts = [mkAccount('a1', 'SAR'), mkAccount('a2', 'GBP')];
    const lines = [mkLine('l1', 'a1', 500, 'SAR'), mkLine('l2', 'a2', 200, 'GBP')];
    const txs = [mkTx('l1'), mkTx('l2')];
    // GBP not in the map → treated as 1
    const data = computeDashboard(accounts, txs, lines, [], null, [], [], {}, 'SAR');
    expect(data.totalBaseEquivalent).toBe(700);
  });

  it('counts a loan as a cycle commitment without adding it to category performance', () => {
    const accounts = [mkAccount('bank', 'EGP')];
    const loan: Loan = { id: 'loan-1', householdId: 'h', name: 'Fixed loan', currency: 'EGP', originalTotal: 3600, installmentAmount: 100, totalInstallments: 36, firstPaymentDate: '2026-01-01', dueDay: 1, paymentAccountId: 'bank', status: 'active', createdAt: '', updatedAt: '' };
    const transaction: FinanceTransaction = { id: 'payment', householdId: 'h', type: 'expense', date: '2026-08-01', budgetCycleId: 'cycle', categoryId: null, loanId: loan.id, loanInstallmentNumber: 8, status: 'posted', createdBy: 'u', createdAt: '', updatedAt: '' };
    const line: LedgerLine = { id: 'line', householdId: 'h', transactionId: transaction.id, accountId: 'bank', signedAmount: -100, currency: 'EGP', createdAt: '' };
    const data = computeDashboard(accounts, [transaction], [line], [], { id: 'cycle', householdId: 'h', name: 'August', startDate: '2026-08-01', endDate: '2026-08-31', status: 'open' }, [], [], {}, 'EGP', [loan]);
    expect(data.spending.plannedBudget).toBe(100);
    expect(data.spending.actual).toBe(100);
    expect(data.categoryStatus).toEqual([]);
    expect(data.loanCommitments).toEqual([{ loanId: 'loan-1', loanName: 'Fixed loan', planned: 100, paid: 100, currency: 'EGP' }]);
  });
});
