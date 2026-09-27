import { describe, expect, it } from 'vitest';
import { computeSharedBalance } from './sharedBalance';

const me = 'uid_me';
const brother = 'uid_brother';

const entry = (over: Record<string, unknown>) => ({
  status: 'approved',
  fromUid: me,
  toUid: brother,
  amount: 100,
  ...over,
});

describe('computeSharedBalance', () => {
  it('sums approved entries from the viewer perspective', () => {
    const balance = computeSharedBalance([
      entry({ amount: 300 }) as never,
      { status: 'approved', fromUid: brother, toUid: me, amount: 200 } as never,
      { status: 'pending', fromUid: me, toUid: brother, amount: 50 } as never,
    ], me);
    expect(balance).toBe(100);
  });

  it('negates for the counterparty view', () => {
    const entries = [entry({ amount: 300 }) as never];
    expect(computeSharedBalance(entries, me)).toBe(300);
    expect(computeSharedBalance(entries, brother)).toBe(-300);
  });
});
