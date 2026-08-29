export type OriginalCharge = { currency: string; amount: number; rate: number };

/**
 * Resolves the amounts written to the ledger when approving an imported message.
 * With a converted amount (foreign-currency card charge), the transaction settles
 * in the account currency and the original charge is preserved with its rate.
 */
export function settledAmounts(
  pendingAmount: number,
  pendingCurrency: string,
  convertedAmount: number | null,
  accountCurrency: string,
): { amount: number; currency: string; originalCharge: OriginalCharge | null } {
  if (convertedAmount == null) {
    return { amount: pendingAmount, currency: pendingCurrency, originalCharge: null };
  }
  return {
    amount: convertedAmount,
    currency: accountCurrency,
    originalCharge: { currency: pendingCurrency, amount: pendingAmount, rate: convertedAmount / pendingAmount },
  };
}
