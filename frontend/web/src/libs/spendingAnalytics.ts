import type { Category, CurrencyCode, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { convertToBaseCurrency } from './financeCalculations';

export type CategorySpend = { key: string; name: string; amount: number };
export type MerchantSpend = { key: string; name: string; amount: number; transactionCount: number };
export type MonthlySpending = {
  month: string; // YYYY-MM
  total: number;
  byCategory: CategorySpend[];
  byMerchant: MerchantSpend[];
};

export const UNCATEGORIZED_KEY = '__uncategorized__';

const isPostedExpense = (transaction: FinanceTransaction) =>
  transaction.status === 'posted' && transaction.type === 'expense';

/** Expense amount of one transaction in base currency (sum of its outflow lines). */
function expenseAmountInBase(transaction: FinanceTransaction, lines: LedgerLine[], baseCurrency: CurrencyCode, rates: Partial<Record<CurrencyCode, number>>): number {
  return lines
    .filter((line) => line.transactionId === transaction.id && line.signedAmount < 0)
    .reduce((sum, line) => sum + Math.abs(convertToBaseCurrency(line.signedAmount, line.currency, baseCurrency, rates)), 0);
}

/** Distinct YYYY-MM months that have posted expenses, newest first. */
export function spendingMonths(transactions: FinanceTransaction[]): string[] {
  const months = new Set<string>();
  for (const transaction of transactions) {
    if (isPostedExpense(transaction)) months.add(transaction.date.slice(0, 7));
  }
  return [...months].sort((a, b) => b.localeCompare(a));
}

/** Shifts a YYYY-MM month by a whole number of months (negative = back). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

/** Per-category and per-merchant spending for one month, descending by amount. */
export function monthlySpending(
  transactions: FinanceTransaction[],
  lines: LedgerLine[],
  categories: Category[],
  baseCurrency: CurrencyCode,
  rates: Partial<Record<CurrencyCode, number>>,
  month: string,
): MonthlySpending {
  const categoryTotals = new Map<string, number>();
  const merchantTotals = new Map<string, MerchantSpend>();
  let total = 0;
  for (const transaction of transactions) {
    if (!isPostedExpense(transaction) || transaction.date.slice(0, 7) !== month) continue;
    const amount = expenseAmountInBase(transaction, lines, baseCurrency, rates);
    if (amount <= 0) continue;
    total += amount;
    const categoryKey = transaction.categoryId ?? UNCATEGORIZED_KEY;
    categoryTotals.set(categoryKey, (categoryTotals.get(categoryKey) ?? 0) + amount);
    const merchantName = transaction.merchant?.trim();
    const merchantKey = merchantName ? merchantName.toLowerCase() : UNCATEGORIZED_KEY;
    const existing = merchantTotals.get(merchantKey);
    if (existing) {
      existing.amount += amount;
      existing.transactionCount += 1;
    } else {
      merchantTotals.set(merchantKey, { key: merchantKey, name: merchantName || '', amount, transactionCount: 1 });
    }
  }
  const categoryName = (id: string) =>
    id === UNCATEGORIZED_KEY ? '' : categories.find((category) => category.id === id)?.name ?? '';
  const byCategory: CategorySpend[] = [...categoryTotals.entries()]
    .map(([key, amount]) => ({ key, name: categoryName(key), amount }))
    .sort((a, b) => b.amount - a.amount);
  const byMerchant: MerchantSpend[] = [...merchantTotals.values()]
    .sort((a, b) => b.amount - a.amount);
  return { month, total: Number(total.toFixed(2)), byCategory, byMerchant };
}
