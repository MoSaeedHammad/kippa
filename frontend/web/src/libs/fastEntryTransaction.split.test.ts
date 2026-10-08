import { describe, expect, it } from 'vitest';
import { buildSplitEntryLines, equalSplitAllocations } from './fastEntryTransaction';

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

describe('equalSplitAllocations', () => {
  it('splits evenly and absorbs the cent remainder on the first account', () => {
    expect(equalSplitAllocations(100, ['a', 'b'])).toEqual([
      { accountId: 'a', amount: 50 }, { accountId: 'b', amount: 50 },
    ]);
    // 100 / 3 = 33.333… → 33.33 + 33.33 + 33.34
    expect(equalSplitAllocations(100, ['a', 'b', 'c'])).toEqual([
      { accountId: 'a', amount: 33.34 }, { accountId: 'b', amount: 33.33 }, { accountId: 'c', amount: 33.33 },
    ]);
  });

  it('always sums exactly to the total', () => {
    for (const total of [10, 99.99, 1234.56, 0.03]) {
      for (const n of [1, 2, 3, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `acc${i}`);
        const allocations = equalSplitAllocations(total, ids);
        const sum = allocations.reduce((acc, a) => acc + a.amount, 0);
        expect(Math.abs(sum - total)).toBeLessThan(1e-9);
      }
    }
  });

  it('rejects an empty account list', () => {
    expect(() => equalSplitAllocations(100, [])).toThrow();
  });
});
