import { describe, expect, it } from 'vitest';
import type { FinanceTransaction, LedgerLine, Loan } from '@kippa/domain';
import { getLoanProgress, loanHasPaymentDueInCycle, loanInstallmentDate } from './loanCalculations';

const loan: Loan = { id: 'loan-1', householdId: 'hh', name: 'Fixed loan', currency: 'EGP', originalTotal: 1_372_046.04, installmentAmount: 38_112.39, totalInstallments: 36, openingPaidInstallments: 12, openingPaidAmount: 457_349.85, firstPaymentDate: '2025-04-01', dueDay: 1, graceDay: 2, paymentAccountId: 'bank-egp', categoryId: 'loan', status: 'active', createdAt: '2026-08-09T00:00:00Z', updatedAt: '2026-08-09T00:00:00Z' };
const transactions: FinanceTransaction[] = [13, 14, 15, 16, 17].map((installment, index) => ({ id: `tx-${installment}`, householdId: 'hh', type: 'expense', date: `2026-0${index + 4}-01`, categoryId: 'loan', createdBy: 'u', createdAt: '', updatedAt: '', status: 'posted', loanId: loan.id, loanInstallmentNumber: installment }));
const amounts = [38_112, 38_112, 38_112, 38_112.39, 38_112.39];
const lines: LedgerLine[] = amounts.map((amount, index) => ({ id: `line-${index}`, householdId: 'hh', transactionId: transactions[index].id, accountId: 'bank-egp', signedAmount: -amount, currency: 'EGP', createdAt: '' }));

describe('loan calculations', () => {
  it('places the 18th payment in September 2026 and payoff in March 2028', () => { expect(loanInstallmentDate(loan, 18)).toBe('2026-09-01'); expect(loanInstallmentDate(loan, 36)).toBe('2028-03-01'); });
  it('shows 17 paid now and reaches halfway with the September installment', () => { const progress = getLoanProgress(loan, transactions, lines, '2026-08-09'); expect(progress.paidInstallments).toBe(17); expect(progress.progressPercent).toBeCloseTo((17 / 36) * 100, 8); expect(progress.remainingAmount).toBe(724_135.41); expect(progress.nextDueDate).toBe('2026-09-01'); expect(progress.nextInstallmentNumber).toBe(18); expect(progress.remainingInstallments).toBe(19); });
  it('adds the loan only to cycles that include a due date', () => { expect(loanHasPaymentDueInCycle(loan, '2026-08-25', '2026-09-24')).toBe(true); expect(loanHasPaymentDueInCycle(loan, '2026-08-03', '2026-08-20')).toBe(false); });
});
