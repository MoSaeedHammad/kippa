export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type AccountAllocation = { accountId: string; amount: number };

const MAX_AMOUNT = 1_000_000_000;

/**
 * Validates a message split across accounts: each allocation positive, no
 * duplicate accounts, and the total must equal the settled message amount
 * (tolerance 0.01 for currency rounding).
 */
export function validateAccountAllocations(
  raw: unknown,
  totalAmount: number,
): ValidationResult<AccountAllocation[]> {
  if (!Array.isArray(raw)) return { ok: false, error: 'accountAllocations must be a list.' };
  if (raw.length === 0) return { ok: false, error: 'accountAllocations must not be empty.' };
  if (raw.length > 10) return { ok: false, error: 'A message can be split across at most 10 accounts.' };
  const seen = new Set<string>();
  const allocations: AccountAllocation[] = [];
  let sum = 0;
  for (const item of raw) {
    const record = item as Record<string, unknown>;
    const accountId = typeof record?.accountId === 'string' ? record.accountId.trim() : '';
    const amount = record?.amount;
    if (!accountId) return { ok: false, error: 'Each allocation needs an accountId.' };
    if (seen.has(accountId)) return { ok: false, error: 'Each account may appear only once.' };
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return { ok: false, error: 'Allocation amounts must be positive numbers.' };
    }
    seen.add(accountId);
    allocations.push({ accountId, amount });
    sum += amount;
  }
  if (Math.abs(sum - totalAmount) > 0.01) {
    return { ok: false, error: 'The allocation amounts must add up to the message amount.' };
  }
  return { ok: true, value: allocations };
}
