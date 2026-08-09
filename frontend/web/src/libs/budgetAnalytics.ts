import type { BudgetAllocation, BudgetCycle, CurrencyCode, ExpectedIncome, FinanceTransaction, LedgerLine, Loan } from '@kippa/domain';
import { convertToBaseCurrency, getPostedLedgerLines, getPostedTransactions } from './financeCalculations';
import { loanHasPaymentDueInCycle } from './loanCalculations';

type DisplayRates = Partial<Record<CurrencyCode, number>>;

export type CycleAnalyticsDatum = {
  actualExpense: number;
  actualIncome: number;
  expectedIncome: number;
  id: string;
  name: string;
  plannedBudget: number;
  savings: number;
};

export function calculateCycleData(
  cycles: BudgetCycle[],
  transactions: FinanceTransaction[],
  ledgerLines: LedgerLine[],
  allocations: BudgetAllocation[],
  expectedIncomes: ExpectedIncome[],
  baseCurrency: CurrencyCode,
  rates: DisplayRates,
  loans: Loan[] = [],
): CycleAnalyticsDatum[] {
  const postedTransactions = getPostedTransactions(transactions);
  const postedLines = getPostedLedgerLines(transactions, ledgerLines);

  return cycles.map((cycle) => {
    const cycleTransactions = postedTransactions.filter((transaction) => transaction.budgetCycleId === cycle.id);
    const cycleTransactionIds = new Set(cycleTransactions.map((transaction) => transaction.id));
    const cycleLines = postedLines.filter((line) => cycleTransactionIds.has(line.transactionId));
    let actualIncome = 0;
    let actualExpense = 0;

    cycleTransactions.forEach((transaction) => {
      cycleLines.filter((line) => line.transactionId === transaction.id).forEach((line) => {
        const amount = Math.abs(convertToBaseCurrency(line.signedAmount, line.currency, baseCurrency, rates));
        if (transaction.type === 'income') actualIncome += amount;
        if (transaction.type === 'expense') actualExpense += amount;
      });
    });

    const categoryPlan = allocations
      .filter((allocation) => allocation.budgetCycleId === cycle.id)
      .reduce((total, allocation) => total + allocation.plannedAmount, 0);
    const loanPlan = loans.filter(loan => loanHasPaymentDueInCycle(loan, cycle.startDate, cycle.endDate)).reduce((total, loan) => total + convertToBaseCurrency(loan.installmentAmount, loan.currency, baseCurrency, rates), 0);
    const plannedBudget = categoryPlan + loanPlan;
    const expectedIncome = expectedIncomes
      .filter((income) => income.budgetCycleId === cycle.id)
      .reduce((total, income) => total + income.amount * (income.currency === baseCurrency ? 1 : income.expectedRateToBaseCurrency || rates[income.currency] || 1), 0);

    return {
      id: cycle.id,
      name: cycle.name,
      actualIncome: Math.round(actualIncome),
      actualExpense: Math.round(actualExpense),
      plannedBudget: Math.round(plannedBudget),
      expectedIncome: Math.round(expectedIncome),
      savings: Math.round(actualIncome - actualExpense),
    };
  });
}

export function calculateCategoryTrends(
  cycles: BudgetCycle[],
  transactions: FinanceTransaction[],
  ledgerLines: LedgerLine[],
  categoryId: string,
  baseCurrency: CurrencyCode,
  rates: DisplayRates,
) {
  const postedTransactions = getPostedTransactions(transactions);
  const postedLines = getPostedLedgerLines(transactions, ledgerLines);

  return cycles.map((cycle) => {
    const cycleTransactions = postedTransactions.filter((transaction) => transaction.budgetCycleId === cycle.id && transaction.categoryId === categoryId);
    const cycleIds = new Set(cycleTransactions.map((transaction) => transaction.id));
    const spent = postedLines
      .filter((line) => cycleIds.has(line.transactionId))
      .reduce((total, line) => total + Math.abs(convertToBaseCurrency(line.signedAmount, line.currency, baseCurrency, rates)), 0);
    return { cycleName: cycle.name, spent: Math.round(spent) };
  });
}

export function buildCashFlowSeries(cycleData: CycleAnalyticsDatum[]) {
  const spend = cycleData.map((datum) => datum.actualExpense);
  const retained = cycleData.map((datum) => Math.max(datum.actualIncome - datum.actualExpense, 0));
  const planGap = cycleData.map((datum) => {
    const target = Math.max(datum.expectedIncome, datum.plannedBudget, datum.actualIncome, datum.actualExpense);
    return Math.max(target - datum.actualExpense - Math.max(datum.actualIncome - datum.actualExpense, 0), 0);
  });
  return { spend, retained, planGap };
}
