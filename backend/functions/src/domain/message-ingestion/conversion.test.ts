import { describe, expect, it } from 'vitest';
import { settledAmounts } from './conversion.js';

describe('settledAmounts', () => {
  it('passes through unchanged when no conversion is supplied', () => {
    expect(settledAmounts(325, 'EGP', null, 'EGP')).toEqual({ amount: 325, currency: 'EGP', originalCharge: null });
  });

  it('settles a foreign-currency charge in the account currency and preserves the original', () => {
    expect(settledAmounts(5.8, 'USD', 290, 'EGP')).toEqual({
      amount: 290, currency: 'EGP',
      originalCharge: { currency: 'USD', amount: 5.8, rate: 290 / 5.8 },
    });
  });
});
