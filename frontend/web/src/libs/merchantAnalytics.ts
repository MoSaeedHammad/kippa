import type { CurrencyCode, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { convertToBaseCurrency } from './financeCalculations';

/** A merchant/beneficiary aggregated across all posted expense transactions. */
export type MerchantAggregate = {
  /** Normalized merchant key ('' when the transaction has no merchant). */
  key: string;
  /** Display name (latest raw value seen). */
  name: string;
  totalExpense: number;
  transactionCount: number;
  lastUsed: string;
  /** categoryId → number of transactions using it. */
  categoryCounts: Record<string, number>;
  /** Most-used category (null when none or tied). */
  primaryCategoryId: string | null;
  /** Transactions with no category — the assignment targets. */
  uncategorizedCount: number;
};

export const NO_MERCHANT_KEY = '';

export function normalizeMerchantKey(name: string): string {
  return name.trim().toLowerCase();
}

export function merchantDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed || '';
}

/** Aggregates posted expense transactions by normalized merchant, biggest spenders first. */
export function aggregateMerchants(
  transactions: FinanceTransaction[],
  lines: LedgerLine[],
  baseCurrency: CurrencyCode,
  rates: Partial<Record<CurrencyCode, number>>,
): MerchantAggregate[] {
  const byKey = new Map<string, MerchantAggregate>();
  for (const transaction of transactions) {
    if (transaction.status !== 'posted' || transaction.type !== 'expense') continue;
    const amount = lines
      .filter((line) => line.transactionId === transaction.id && line.signedAmount < 0)
      .reduce((sum, line) => sum + Math.abs(convertToBaseCurrency(line.signedAmount, line.currency, baseCurrency, rates)), 0);
    if (amount <= 0) continue;
    const key = transaction.merchant ? normalizeMerchantKey(transaction.merchant) : NO_MERCHANT_KEY;
    const existing = byKey.get(key);
    if (existing) {
      existing.totalExpense += amount;
      existing.transactionCount += 1;
      if (transaction.date > existing.lastUsed) {
        existing.lastUsed = transaction.date;
        if (key) existing.name = transaction.merchant!;
      }
    } else {
      byKey.set(key, {
        key,
        name: merchantDisplayName(transaction.merchant),
        totalExpense: amount,
        transactionCount: 1,
        lastUsed: transaction.date,
        categoryCounts: {},
        primaryCategoryId: null,
        uncategorizedCount: 0,
      });
    }
    const aggregate = byKey.get(key)!;
    if (transaction.categoryId) {
      aggregate.categoryCounts[transaction.categoryId] = (aggregate.categoryCounts[transaction.categoryId] ?? 0) + 1;
    } else {
      aggregate.uncategorizedCount += 1;
    }
  }
  // Most-used category, null on ties.
  for (const aggregate of byKey.values()) {
    const entries = Object.entries(aggregate.categoryCounts);
    if (entries.length === 0) continue;
    entries.sort((a, b) => b[1] - a[1]);
    aggregate.primaryCategoryId = entries.length > 1 && entries[0][1] === entries[1][1] ? null : entries[0][0];
  }
  return [...byKey.values()].sort((a, b) => b.totalExpense - a.totalExpense);
}

/**
 * Transactions a merchant category assignment should touch: every posted
 * expense of the same merchant that does not already carry the category.
 */
export function transactionsForMerchantAssignment(
  transactions: FinanceTransaction[],
  merchantKey: string,
  categoryId: string,
): FinanceTransaction[] {
  return transactions.filter((transaction) =>
    transaction.status === 'posted'
    && transaction.type === 'expense'
    && transaction.categoryId !== categoryId
    && (transaction.merchant ? normalizeMerchantKey(transaction.merchant) : NO_MERCHANT_KEY) === merchantKey);
}

/**
 * Distinct merchant names already recorded on posted transactions — the
 * suggestion pool for merchant autocomplete when editing a transaction or
 * approving an imported bank message. Trimmed, deduplicated (case-insensitive,
 * keeping the raw casing of the first sighting) and alphabetically sorted.
 */
export function recordedMerchantNames(transactions: FinanceTransaction[]): string[] {
  const byKey = new Map<string, string>();
  for (const transaction of transactions) {
    const name = merchantDisplayName(transaction.merchant);
    if (!name) continue;
    const key = normalizeMerchantKey(name);
    if (!byKey.has(key)) byKey.set(key, name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
