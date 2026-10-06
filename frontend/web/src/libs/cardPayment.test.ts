import { describe, expect, it } from 'vitest';
import { calculateCardPayment } from './cardPayment';

describe('calculateCardPayment', () => {
  it('calculates the default three percent fee and rounds currency values', () => {
    expect(calculateCardPayment(999.99, 3)).toEqual({
      valid: true,
      baseAmount: 999.99,
      feeAmount: 30,
      totalAmount: 1029.99,
    });
  });

  it('rounds the base, fee, and total independently to two decimals', () => {
    expect(calculateCardPayment(10.005, 2.5)).toEqual({
      valid: true,
      baseAmount: 10.01,
      feeAmount: 0.25,
      totalAmount: 10.26,
    });
  });

  it('supports a zero fee', () => {
    expect(calculateCardPayment(100, 0)).toEqual({
      valid: true,
      baseAmount: 100,
      feeAmount: 0,
      totalAmount: 100,
    });
  });

  it.each([
    ['', 3],
    [0, 3],
    [-1, 3],
    [100, ''],
    [100, -0.01],
    [100, 100.01],
    [Number.NaN, 3],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 3],
    [100, Number.POSITIVE_INFINITY],
  ] as const)('rejects invalid amount or fee rate (%p, %p)', (amount, feeRate) => {
    expect(calculateCardPayment(amount, feeRate)).toEqual({
      valid: false,
      baseAmount: 0,
      feeAmount: 0,
      totalAmount: 0,
    });
  });
});
