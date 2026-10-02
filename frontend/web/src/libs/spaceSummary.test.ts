import { describe, expect, it } from 'vitest';
import { summarizeSpaceAccounts } from './spaceSummary';

const account = (id: string, currency: string, over: Record<string, unknown> = {}) => ({
  id, currency, isActive: true, isSharedBalance: undefined, ...over,
});

describe('summarizeSpaceAccounts', () => {
  it('sums per currency and excludes inactive and mirror accounts', () => {
    const summary = summarizeSpaceAccounts(
      [
        account('a', 'EGP'),
        account('b', 'EGP'),
        account('c', 'USD'),
        account('mirror', 'EGP', { isSharedBalance: true }),
        account('dead', 'EGP', { isActive: false }),
      ],
      [
        { accountId: 'a', signedAmount: 1000 },
        { accountId: 'b', signedAmount: -250 },
        { accountId: 'c', signedAmount: 50 },
        { accountId: 'mirror', signedAmount: 999 },
      ],
    );
    expect(summary.accountsCount).toBe(3);
    expect(summary.balances).toEqual([
      { currency: 'EGP', amount: 750 },
      { currency: 'USD', amount: 50 },
    ]);
  });

  it('ignores lines for unknown accounts', () => {
    const summary = summarizeSpaceAccounts([account('a', 'EGP')], [{ accountId: 'ghost', signedAmount: 5 }]);
    expect(summary.balances).toEqual([]);
  });
});
