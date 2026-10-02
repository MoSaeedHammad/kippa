import { describe, expect, it } from 'vitest';
import { buildSplitEntryLines } from './fastEntryTransaction';

describe('buildSplitEntryLines', () => {
  it('builds signed lines per allocation', () => {
    const lines = buildSplitEntryLines({
      totalAmount: 500, currency: 'EGP', isIncome: false,
      allocations: [{ accountId: 'a', amount: 300 }, { accountId: 'b', amount: 200 }],
    });
    expect(lines).toEqual([
      { accountId: 'a', signedAmount: -300, currency: 'EGP' },
      { accountId: 'b', signedAmount: -200, currency: 'EGP' },
    ]);
  });

  it('rejects empty rows, duplicates, bad amounts and wrong totals', () => {
    const bad = (allocations: never[]) => () => buildSplitEntryLines({ totalAmount: 100, currency: 'EGP', isIncome: true, allocations });
    expect(bad([])).toThrow();
    expect(bad([{ accountId: 'a', amount: 50 }, { accountId: 'a', amount: 50 }] as never)).toThrow();
    expect(bad([{ accountId: 'a', amount: 0 }] as never)).toThrow();
    expect(bad([{ accountId: 'a', amount: 90 }] as never)).toThrow();
    expect(buildSplitEntryLines({ totalAmount: 100, currency: 'EGP', isIncome: true, allocations: [{ accountId: 'a', amount: 100 }] })).toHaveLength(1);
  });
});
