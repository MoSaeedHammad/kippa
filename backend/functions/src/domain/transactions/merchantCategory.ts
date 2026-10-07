import type { FinanceTransaction } from '@kippa/domain';

/**
 * Pure merchant-category matcher: among posted transactions for the same
 * merchant (case-insensitive, trimmed), returns the most-used category of
 * the matching type. Needs at least two history entries so a single odd
 * assignment does not dominate, and ambiguous ties never suggest.
 */
export function matchMerchantCategory(
  transactions: FinanceTransaction[],
  merchant: string,
  kind: 'expense' | 'income',
): string | null {
  const normalized = merchant.trim().toLowerCase();
  if (!normalized) return null;
  const counts = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.status !== 'posted' || transaction.type !== kind) continue;
    if ((transaction.merchant ?? '').trim().toLowerCase() !== normalized) continue;
    if (!transaction.categoryId) continue;
    counts.set(transaction.categoryId, (counts.get(transaction.categoryId) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0 || (sorted.length > 1 && sorted[0][1] === sorted[1][1])) return null;
  return sorted[0][0];
}
