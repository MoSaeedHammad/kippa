import { describe, expect, it } from 'vitest';
import type { Account, BudgetAllocation, BudgetCycle, Category, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { withDefaultCardFee, includeUnrecordedCardFees } from './creditCardFees';
import { computeDashboard } from './selectors';
import { calculateCycleReport } from './cycleReport';
import { computeCardSummary, currentCyclePurchases } from './cardSelectors';

const account = (id: string, type: Account['type'] = 'credit', currency: 'EGP' | 'USD' = 'EGP'): Account => ({
  id, householdId: 'h', name: id, type, currency, isActive: true, sortOrder: 0, createdAt: '',
});

const transaction = (id: string, overrides: Partial<FinanceTransaction> = {}): FinanceTransaction => ({
  id, householdId: 'h', type: 'expense', date: '2026-01-10', createdBy: 'u', createdAt: '', updatedAt: '', status: 'posted',
  budgetCycleId: 'cycle', categoryId: 'food', ...overrides,
});

const line = (id: string, transactionId: string, signedAmount: number, overrides: Partial<LedgerLine> = {}): LedgerLine => ({
  id, householdId: 'h', transactionId, accountId: 'credit', signedAmount, currency: 'EGP', createdAt: '', ...overrides,
});

const eligible = line('line', 'purchase', -999.99);

describe('credit card fee enrichment', () => {
  it('grosses up a new EGP credit-card expense and records its source amount and rate', () => {
    expect(withDefaultCardFee(eligible, account('credit'), 'expense')).toMatchObject({
      signedAmount: -1029.99,
      cardFee: { baseAmount: 999.99, rate: 3 },
    });
  });

  it('preserves an existing fee, including an explicitly edited zero rate', () => {
    const edited = { ...eligible, signedAmount: -999.99, cardFee: { baseAmount: 999.99, rate: 0 } };
    expect(withDefaultCardFee(edited, account('credit'), 'expense')).toBe(edited);
  });

  it.each([
    ['debit account', account('bank', 'running'), eligible],
    ['USD credit account', account('credit', 'credit', 'USD'), line('line', 'purchase', -999.99, { currency: 'USD' })],
    ['positive line', account('credit'), line('line', 'income', 999.99)],
    ['income transaction', account('credit'), eligible],
  ])('leaves %s unchanged', (_name, acc, candidate) => {
    const type = _name === 'income transaction' ? 'income' : 'expense';
    expect(withDefaultCardFee(candidate, acc, type)).toBe(candidate);
  });

  it('projects a legacy unpaid purchase while leaving paid history and metadata untouched', () => {
    const purchase = transaction('purchase');
    const paidPurchase = transaction('paid-purchase');
    const paidExplicit = transaction('paid-explicit', { settlesChargeIds: ['paid-purchase'] });
    const existing = { ...line('existing', 'paid-explicit', 999.99), cardFee: { baseAmount: 970.86, rate: 3 } };
    const paidCharge = line('paid-charge', 'paid-purchase', -999.99);
    const result = includeUnrecordedCardFees([account('credit')], [purchase, paidPurchase, paidExplicit], [eligible, paidCharge, existing]);
    expect(result[0]).toMatchObject({ signedAmount: -1029.99, cardFee: { baseAmount: 999.99, rate: 3 } });
    expect(result[1]).toBe(paidCharge);
    expect(result[2]).toBe(existing);
  });

  it('projects only legacy unpaid expense lines and skips voided, income, transfer, adjustment, and card-fee rows', () => {
    const transactions = [
      transaction('unpaid'),
      transaction('voided', { status: 'voided' }),
      transaction('income', { type: 'income' }),
      transaction('transfer', { type: 'transfer' }),
      transaction('adjustment', { type: 'adjustment' }),
      transaction('standalone-fee', { description: 'Card fee (3%)' }),
    ];
    const lines = [
      line('unpaid-line', 'unpaid', -100),
      line('voided-line', 'voided', -100),
      line('income-line', 'income', -100),
      line('transfer-line', 'transfer', -100),
      line('adjustment-line', 'adjustment', -100),
      line('fee-line', 'standalone-fee', -3),
    ];
    const result = includeUnrecordedCardFees([account('credit')], transactions, lines);
    expect(result[0]).toMatchObject({ signedAmount: -103, cardFee: { baseAmount: 100, rate: 3 } });
    expect(result.slice(1)).toEqual(lines.slice(1));
  });

  it('leaves purchases settled by an unlinked same-cycle payment unchanged', () => {
    const purchase = transaction('purchase');
    const payment = transaction('payment', { type: 'transfer' });
    const paymentLine = line('payment-line', 'payment', 999.99);
    expect(includeUnrecordedCardFees([account('credit')], [purchase, payment], [eligible, paymentLine])[0]).toBe(eligible);
  });

  it('does not double-count a persisted gross purchase in card and report summaries', () => {
    const purchase = transaction('purchase');
    const gross = { ...line('purchase-line', 'purchase', -1029.99), cardFee: { baseAmount: 999.99, rate: 3 } };
    const cycle: BudgetCycle = { id: 'cycle', householdId: 'h', name: 'Current', startDate: '2026-01-01', endDate: '2026-01-31', status: 'open' };
    const category: Category = { id: 'food', householdId: 'h', name: 'Food', type: 'expense', isActive: true, createdAt: '' };
    const allocation: BudgetAllocation = { id: 'allocation', householdId: 'h', budgetCycleId: 'cycle', categoryId: 'food', plannedAmount: 2000, carryLeftover: false, currency: 'EGP' };
    expect(currentCyclePurchases([gross], [purchase], 'credit', null)).toBe(1029.99);
    expect(calculateCycleReport(cycle, [account('credit')], [category], [purchase], [gross], [allocation], 'EGP', {}).totalSpending).toBe(1029.99);
    const dashboard = computeDashboard([account('credit')], [purchase], [gross], [category], cycle, [allocation], [], {}, 'EGP');
    expect(dashboard.spending.actual).toBe(1029.99);
    expect(dashboard.categoryStatus[0].spent).toBe(1029.99);
    expect(dashboard.accountBalances[0].balance).toBe(-1029.99);
    expect(dashboard.totalBaseEquivalent).toBe(-1029.99);
    expect(computeCardSummary({ creditLimit: 2000 } as any, dashboard.accountBalances[0].balance, null, [])).toMatchObject({ currentDebt: 1029.99, availableCredit: 970.01 });
  });
});
