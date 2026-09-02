import type {
  Account,
  BudgetAllocation,
  BudgetCycle,
  Category,
  CurrencyCode,
  FinanceTransaction,
  LedgerLine,
} from '@kippa/domain';
import { convertToBaseCurrency } from './financeCalculations';

export type DisplayRates = Partial<Record<CurrencyCode, number>>;
export const LOAN_PAYMENTS_CATEGORY_ID = '__loan_payments__';

export type CycleReportAccount = {
  accountId: string;
  accountName: string;
  accountType: Account['type'];
  currency: CurrencyCode;
  openingBalance: number;
  moneyIn: number;
  moneyOut: number;
  closingBalance: number;
  transactionCount: number;
};

export type CycleReportCategory = {
  categoryId: string | null;
  categoryName: string;
  planned: number;
  spent: number;
  variance: number;
  share: number;
};

export type CycleReport = {
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalSpending: number;
  netCashFlow: number;
  savingsRate: number;
  accounts: CycleReportAccount[];
  categories: CycleReportCategory[];
};

function base(amount: number, currency: CurrencyCode, baseCurrency: CurrencyCode, rates: DisplayRates) {
  return convertToBaseCurrency(amount, currency, baseCurrency, rates);
}

/** Build a point-in-time report for one budget cycle from its posted ledger. */
export function calculateCycleReport(
  cycle: BudgetCycle,
  accounts: Account[],
  categories: Category[],
  transactions: FinanceTransaction[],
  ledgerLines: LedgerLine[],
  allocations: BudgetAllocation[],
  baseCurrency: CurrencyCode,
  displayRates: DisplayRates,
): CycleReport {
  const posted = new Map(
    transactions.filter(transaction => transaction.status === 'posted').map(transaction => [transaction.id, transaction]),
  );
  const cycleTransactions = transactions.filter(
    transaction => transaction.status === 'posted' && transaction.budgetCycleId === cycle.id,
  );
  const cycleIds = new Set(cycleTransactions.map(transaction => transaction.id));
  const openingIds = new Set(
    transactions
      .filter(transaction => transaction.status === 'posted' && transaction.date < cycle.startDate && !cycleIds.has(transaction.id))
      .map(transaction => transaction.id),
  );

  const openingByAccount = new Map<string, number>();
  const activityByAccount = new Map<string, { moneyIn: number; moneyOut: number; net: number; ids: Set<string> }>();
  const categorySpent = new Map<string | null, number>();
  let totalIncome = 0;
  let totalSpending = 0;

  for (const line of ledgerLines) {
    const transaction = posted.get(line.transactionId);
    if (!transaction) continue;

    if (openingIds.has(transaction.id)) {
      openingByAccount.set(line.accountId, (openingByAccount.get(line.accountId) ?? 0) + line.signedAmount);
    }
    if (!cycleIds.has(transaction.id)) continue;

    const activity = activityByAccount.get(line.accountId) ?? { moneyIn: 0, moneyOut: 0, net: 0, ids: new Set<string>() };
    activity.moneyIn += Math.max(line.signedAmount, 0);
    activity.moneyOut += Math.max(-line.signedAmount, 0);
    activity.net += line.signedAmount;
    activity.ids.add(transaction.id);
    activityByAccount.set(line.accountId, activity);

    if (transaction.type === 'income' && line.signedAmount > 0) {
      totalIncome += base(line.signedAmount, line.currency, baseCurrency, displayRates);
    } else if (transaction.type === 'expense' && line.signedAmount < 0) {
      const spending = base(-line.signedAmount, line.currency, baseCurrency, displayRates);
      totalSpending += spending;
      const categoryId = transaction.loanId ? LOAN_PAYMENTS_CATEGORY_ID : transaction.categoryId ?? null;
      categorySpent.set(categoryId, (categorySpent.get(categoryId) ?? 0) + spending);
    }
  }

  const reportAccounts = accounts
    .filter(account => account.isActive || openingByAccount.has(account.id) || activityByAccount.has(account.id))
    .map(account => {
      const openingBalance = openingByAccount.get(account.id) ?? 0;
      const activity = activityByAccount.get(account.id);
      const moneyIn = activity?.moneyIn ?? 0;
      const moneyOut = activity?.moneyOut ?? 0;
      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        currency: account.currency,
        openingBalance,
        moneyIn,
        moneyOut,
        closingBalance: openingBalance + moneyIn - moneyOut,
        transactionCount: activity?.ids.size ?? 0,
      };
    });

  const householdOpening = reportAccounts.reduce(
    (sum, account) => sum + base(account.openingBalance, account.currency, baseCurrency, displayRates), 0,
  );
  const householdClosing = reportAccounts.reduce(
    (sum, account) => sum + base(account.closingBalance, account.currency, baseCurrency, displayRates), 0,
  );

  const categoryById = new Map(categories.map(category => [category.id, category]));
  const plannedByCategory = new Map<string | null, number>();
  for (const allocation of allocations) {
    if (allocation.budgetCycleId !== cycle.id) continue;
    plannedByCategory.set(
      allocation.categoryId,
      (plannedByCategory.get(allocation.categoryId) ?? 0) + base(allocation.plannedAmount, allocation.currency, baseCurrency, displayRates),
    );
  }
  const categoryIds = new Set([...categorySpent.keys(), ...plannedByCategory.keys()]);
  const reportCategories = Array.from(categoryIds).map(categoryId => {
    const spent = categorySpent.get(categoryId) ?? 0;
    const planned = plannedByCategory.get(categoryId) ?? 0;
    return {
      categoryId,
      categoryName: categoryId === LOAN_PAYMENTS_CATEGORY_ID
        ? 'Loan payments'
        : categoryId === null ? 'Uncategorized' : (categoryById.get(categoryId)?.name ?? 'Uncategorized'),
      planned,
      spent,
      variance: planned - spent,
      share: totalSpending === 0 ? 0 : spent / totalSpending,
    };
  }).sort((a, b) => b.spent - a.spent || b.planned - a.planned || a.categoryName.localeCompare(b.categoryName));

  return {
    openingBalance: householdOpening,
    closingBalance: householdClosing,
    totalIncome,
    totalSpending,
    netCashFlow: totalIncome - totalSpending,
    savingsRate: totalIncome === 0 ? 0 : ((totalIncome - totalSpending) / totalIncome) * 100,
    accounts: reportAccounts,
    categories: reportCategories,
  };
}
