import { describe, expect, it } from 'vitest';
import { calculateCreditCardLedgerAmount } from './creditCardFee.js';

const base = { amount: 999.99, currency: 'EGP', accountType: 'credit' as const, transactionType: 'expense' as const };

describe('calculateCreditCardLedgerAmount', () => {
  it('adds a rounded 3% fee to EGP credit-card expenses', () => {
    expect(calculateCreditCardLedgerAmount(base)).toEqual({
      signedAmount: -1029.99,
      cardFee: { baseAmount: 999.99, rate: 3 },
    });
  });

  it('leaves non-credit expenses unchanged', () => {
    expect(calculateCreditCardLedgerAmount({ ...base, accountType: 'running' })).toEqual({ signedAmount: -999.99 });
  });

  it('leaves transfers and income unchanged', () => {
    expect(calculateCreditCardLedgerAmount({ ...base, transactionType: 'transfer' })).toEqual({ signedAmount: -999.99 });
    expect(calculateCreditCardLedgerAmount({ ...base, transactionType: 'income' })).toEqual({ signedAmount: 999.99 });
  });

  it('leaves foreign-currency credit-card expenses unchanged', () => {
    expect(calculateCreditCardLedgerAmount({ ...base, currency: 'USD' })).toEqual({ signedAmount: -999.99 });
  });

  it('leaves loan payments unchanged', () => {
    expect(calculateCreditCardLedgerAmount({ ...base, isLoanPayment: true })).toEqual({ signedAmount: -999.99 });
  });

  it('does not add a fee to a zero amount', () => {
    expect(calculateCreditCardLedgerAmount({ ...base, amount: 0 })).toEqual({ signedAmount: -0 });
  });
});
