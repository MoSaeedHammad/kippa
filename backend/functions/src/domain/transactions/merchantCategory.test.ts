import { describe, expect, it } from 'vitest';
import type { FinanceTransaction } from '@kippa/domain';
import { matchMerchantCategory } from './merchantCategory.js';

const txn = (overrides: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: 't', householdId: 'hh', type: 'expense', date: '2026-01-01', status: 'posted',
  createdBy: 'u', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('matchMerchantCategory', () => {
  it('returns the dominant category after two agreements', () => {
    const transactions = [
      txn({ merchant: 'Talabat', categoryId: 'food' }),
      txn({ merchant: 'talabat ', categoryId: 'food' }),
      txn({ merchant: 'Talabat', categoryId: 'shopping' }),
    ];
    expect(matchMerchantCategory(transactions, 'Talabat', 'expense')).toBe('food');
  });

  it('needs at least two agreeing entries', () => {
    expect(matchMerchantCategory([txn({ merchant: 'Talabat', categoryId: 'food' })], 'Talabat', 'expense')).toBeNull();
  });

  it('never suggests on ambiguous ties and ignores other types or unposted', () => {
    const tied = [
      txn({ merchant: 'M', categoryId: 'a' }), txn({ merchant: 'M', categoryId: 'a' }),
      txn({ merchant: 'M', categoryId: 'b' }), txn({ merchant: 'M', categoryId: 'b' }),
    ];
    expect(matchMerchantCategory(tied, 'M', 'expense')).toBeNull();
    const wrongType = [
      txn({ merchant: 'M', categoryId: 'a' }), txn({ merchant: 'M', categoryId: 'a', status: 'voided' }),
    ];
    expect(matchMerchantCategory(wrongType, 'M', 'expense')).toBeNull();
    expect(matchMerchantCategory([txn({ merchant: 'M', categoryId: 'a', type: 'income' }), txn({ merchant: 'M', categoryId: 'a', type: 'income' })], 'M', 'expense')).toBeNull();
  });
});
