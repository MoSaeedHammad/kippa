/** Amounts entered here are in the card's billing currency. */
export function calculateCardPayment(amount: number | '', feeRate: number | '') {
  const valid = amount !== '' && Number.isFinite(amount) && amount > 0
    && feeRate !== '' && Number.isFinite(feeRate) && feeRate >= 0 && feeRate <= 100;
  if (!valid) return { valid: false, baseAmount: 0, feeAmount: 0, totalAmount: 0 };
  const baseAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
  const feeAmount = Math.round((baseAmount * feeRate / 100 + Number.EPSILON) * 100) / 100;
  const totalAmount = Math.round((baseAmount + feeAmount + Number.EPSILON) * 100) / 100;
  return { valid: baseAmount > 0 && Number.isFinite(totalAmount), baseAmount, feeAmount, totalAmount };
}
