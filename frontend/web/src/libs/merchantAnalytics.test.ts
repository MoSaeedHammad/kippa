import { describe, expect, it } from 'vitest';
import type { FinanceTransaction } from '@kippa/domain';
import { recordedMerchantNames } from './merchantAnalytics';

const transaction = (overrides: Partial<FinanceTransaction>): FinanceTransaction => ({
  id: 't', householdId: 'h', type: 'expense', date: '2026-01-01', description: 'd',
  categoryId: null, budgetCycleId: null, createdBy: 'u', status: 'posted',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('recordedMerchantNames', () => {
  it('collects distinct merchants from posted transactions, sorted', () => {
    const names = recordedMerchantNames([
      transaction({ merchant: 'Fawry' }),
      transaction({ merchant: 'AMAN' }),
      transaction({ merchant: 'Fawry · BEANOS' }),
    ]);
    expect(names).toEqual(['AMAN', 'Fawry', 'Fawry · BEANOS']);
  });

  it('deduplicates case-insensitively keeping the first raw casing', () => {
    const names = recordedMerchantNames([
      transaction({ merchant: 'uber' }),
      transaction({ merchant: 'Uber' }),
      transaction({ merchant: ' UBER ' }),
    ]);
    expect(names).toEqual(['uber']);
  });

  it('skips transactions without a usable merchant', () => {
    const names = recordedMerchantNames([
      transaction({ merchant: null }),
      transaction({ merchant: '   ' }),
      transaction({}),
    ]);
    expect(names).toEqual([]);
  });
});
