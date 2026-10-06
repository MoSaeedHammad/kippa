import type { TransactionType } from '@kippa/domain';

export const CREDIT_CARD_FEE_RATE = 3;

export type CreditCardFeeInput = {
  amount: number;
  currency: string;
  accountType: string;
  transactionType: TransactionType;
  isLoanPayment?: boolean;
  rate?: number;
};

export type CreditCardFeeResult = {
  signedAmount: number;
  cardFee?: { baseAmount: number; rate: number };
};

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates the amount posted to a local EGP credit-card account.
 * Pending messages keep their parsed base amount; only the posted ledger line
 * includes the card fee.
 */
export function calculateCreditCardLedgerAmount(input: CreditCardFeeInput): CreditCardFeeResult {
  const baseAmount = roundCents(Math.abs(input.amount));
  const qualifies = input.transactionType === 'expense'
    && !input.isLoanPayment
    && input.accountType === 'credit'
    && input.currency.toUpperCase() === 'EGP'
    && baseAmount > 0;

  if (!qualifies) return { signedAmount: input.transactionType === 'income' ? input.amount : -input.amount };

  const rate = input.rate ?? CREDIT_CARD_FEE_RATE;
  const fee = roundCents(baseAmount * rate / 100);
  return {
    signedAmount: -roundCents(baseAmount + fee),
    cardFee: { baseAmount, rate },
  };
}
