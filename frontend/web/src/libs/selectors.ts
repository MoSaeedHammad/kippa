import { Account, FinanceTransaction, LedgerLine, BudgetCycle, BudgetAllocation, ExpectedIncome, Category, CurrencyCode, Loan } from '@kippa/domain';
import { calculateAccountBalances, convertToBaseCurrency, getPostedLedgerLines, getPostedTransactions } from './financeCalculations';
import { loanHasPaymentDueInCycle } from './loanCalculations';

export interface DashboardData {
  accountBalances: { accountId: string; balance: number }[];
  totalBaseEquivalent: number;
  baseCurrency: CurrencyCode;
  cycleProgress: {
    elapsedDays: number;
    totalDays: number;
    ratio: number;
    remainingDays: number;
  } | null;
  spending: {
    actual: number;
    projected: number;
    plannedBudget: number;
  };
  income: {
    actual: number;
    expected: number;
  };
  saving: {
    actual: number;
    target: number;
    projected: number;
    status: 'on-track' | 'warning' | 'overspending';
  };
  safeDailySpend: {
    budgetSafe: number;
    cashSafe: number;
  };
  categoryStatus: {
    categoryId: string;
    categoryName: string;
    spent: number;
    planned: number;
    ratio: number;
    status: 'on-track' | 'warning' | 'over';
  }[];
  loanCommitments: { loanId: string; loanName: string; planned: number; paid: number; currency: CurrencyCode }[];
}

export function computeDashboard(
  accounts: Account[],
  transactions: FinanceTransaction[],
  ledgerLines: LedgerLine[],
  categories: Category[],
  activeCycle: BudgetCycle | null,
  allocations: BudgetAllocation[],
  expectedIncomes: ExpectedIncome[],
  displayRates: Record<string, number>,
  baseCurrency: CurrencyCode,
  loans: Loan[] = [],
): DashboardData {
  // 1. Filter out voided transactions
  const activeTxs = getPostedTransactions(transactions);
  const activeLines = getPostedLedgerLines(transactions, ledgerLines);

  // 2. Account balances
  const balancesMap = calculateAccountBalances(accounts, transactions, ledgerLines);

  const accountBalances = accounts.map(acc => ({
    accountId: acc.id,
    balance: balancesMap[acc.id] || 0,
  }));

  // 3. Total base-currency equivalent
  let totalBaseEquivalent = 0;
  accounts.forEach(acc => {
    const bal = balancesMap[acc.id] || 0;
    const rate = acc.currency === baseCurrency ? 1 : (displayRates[acc.currency] ?? 1);
    totalBaseEquivalent += bal * rate;
  });

  // 4. Cycle progress
  let cycleProgress: DashboardData['cycleProgress'] = null;
  if (activeCycle) {
    const start = new Date(activeCycle.startDate);
    const end = activeCycle.endDate ? new Date(activeCycle.endDate) : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    
    // Set to midnight for date comparison
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const elapsedDays = Math.max(1, Math.min(totalDays, Math.round((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1));
    const remainingDays = Math.max(0, totalDays - elapsedDays);
    const ratio = elapsedDays / totalDays;

    cycleProgress = {
      elapsedDays,
      totalDays,
      ratio,
      remainingDays,
    };
  }

  // 5. Filter transactions belonging to current cycle
  const cycleTxIds = new Set(
    activeTxs
      .filter(t => activeCycle ? t.budgetCycleId === activeCycle.id : false)
      .map(t => t.id)
  );
  const cycleLines = activeLines.filter(line => cycleTxIds.has(line.transactionId));
  const cycleTxsList = activeTxs.filter(t => activeCycle ? t.budgetCycleId === activeCycle.id : false);

  // 6. Category Calculations & Burn Rates
  // Sum up expenses per category in the current cycle
  const catSpent: Record<string, number> = {};
  categories.forEach(cat => {
    catSpent[cat.id] = 0;
  });

  cycleTxsList.forEach(tx => {
    if (tx.type === 'expense' && tx.categoryId && !tx.loanId) {
      // Find the ledger line for this expense
      const linesForTx = cycleLines.filter(l => l.transactionId === tx.id);
      linesForTx.forEach(l => {
        // Expense is negative, sum the absolute base-currency equivalent value
        const amountBase = Math.abs(convertToBaseCurrency(l.signedAmount, l.currency, baseCurrency, displayRates));
        catSpent[tx.categoryId!] = (catSpent[tx.categoryId!] || 0) + amountBase;
      });
    }
  });

  const categoryStatus: DashboardData['categoryStatus'] = allocations.map(alloc => {
    const cat = categories.find(c => c.id === alloc.categoryId);
    const spent = catSpent[alloc.categoryId] || 0;
    const ratio = alloc.plannedAmount > 0 ? spent / alloc.plannedAmount : 0;
    const progRatio = cycleProgress ? cycleProgress.ratio : 0.5;

    const tolerance = 0.10;
    let status: 'on-track' | 'warning' | 'over' = 'on-track';

    if (ratio > progRatio + tolerance) {
      status = 'over';
    } else if (ratio > progRatio) {
      status = 'warning';
    }

    return {
      categoryId: alloc.categoryId,
      categoryName: cat?.name || 'Unknown',
      spent,
      planned: alloc.plannedAmount,
      ratio,
      status,
    };
  });

  const loanCommitments = activeCycle ? loans
    .filter(loan => loanHasPaymentDueInCycle(loan, activeCycle.startDate, activeCycle.endDate))
    .map(loan => {
      const paid = cycleTxsList.filter(transaction => transaction.type === 'expense' && transaction.loanId === loan.id).reduce((sum, transaction) => {
        return sum + cycleLines.filter(line => line.transactionId === transaction.id && line.signedAmount < 0).reduce((lineSum, line) => lineSum + Math.abs(convertToBaseCurrency(line.signedAmount, line.currency, baseCurrency, displayRates)), 0);
      }, 0);
      return { loanId: loan.id, loanName: loan.name, planned: convertToBaseCurrency(loan.installmentAmount, loan.currency, baseCurrency, displayRates), paid, currency: loan.currency };
    }) : [];

  // 7. Spending totals. Loan commitments count in the cycle plan and cash
  // outflow, but remain outside category performance.
  const actualSpending = cycleTxsList.filter(transaction => transaction.type === 'expense').reduce((sum, transaction) => sum + cycleLines.filter(line => line.transactionId === transaction.id && line.signedAmount < 0).reduce((lineSum, line) => lineSum + Math.abs(convertToBaseCurrency(line.signedAmount, line.currency, baseCurrency, displayRates)), 0), 0);
  const plannedBudget = allocations.reduce((acc, curr) => acc + curr.plannedAmount, 0) + loanCommitments.reduce((sum, commitment) => sum + commitment.planned, 0);
  const progRatio = cycleProgress ? cycleProgress.ratio : 1;

  // Only project when at least 15% of the cycle has elapsed to avoid wild early extrapolation.
  // Below that threshold, show actual spending as the projection.
  const MIN_PROJECTION_RATIO = 0.15;
  const projectedSpending = progRatio >= MIN_PROJECTION_RATIO
    ? actualSpending / progRatio
    : actualSpending;

  // 8. Income totals
  let actualIncome = 0;
  cycleTxsList.forEach(tx => {
    if (tx.type === 'income') {
      const linesForTx = cycleLines.filter(l => l.transactionId === tx.id);
      linesForTx.forEach(l => {
        actualIncome += convertToBaseCurrency(l.signedAmount, l.currency, baseCurrency, displayRates);
      });
    }
  });

  const expectedIncomeSum = expectedIncomes
    .filter(i => activeCycle ? i.budgetCycleId === activeCycle.id : false)
    .reduce((acc, curr) => {
      const rate = curr.expectedRateToBaseCurrency || (curr.currency === baseCurrency ? 1 : (displayRates[curr.currency] ?? 1));
      return acc + curr.amount * rate;
    }, 0);

  // 9. Saving goals
  // Default target saving (e.g. 20% of income or allocations to category named 'saving' or 'invest')
  const savingAllocation = allocations
    .filter(alloc => {
      const cat = categories.find(c => c.id === alloc.categoryId);
      const nameLower = cat?.name.toLowerCase() || '';
      return nameLower.includes('saving') || nameLower.includes('invest');
    })
    .reduce((acc, curr) => acc + curr.plannedAmount, 0);

  const targetSaving = savingAllocation || (expectedIncomeSum * 0.2); // fallback to 20% of expected income
  const actualSaving = actualIncome - actualSpending;
  const projectedSaving = (expectedIncomeSum || actualIncome) - projectedSpending;

  let savingStatus: DashboardData['saving']['status'] = 'on-track';
  if (projectedSaving < targetSaving * 0.7) {
    savingStatus = 'overspending';
  } else if (projectedSaving < targetSaving) {
    savingStatus = 'warning';
  }

  // 10. Safe Daily Spend
  // remaining days in cycle
  const remDays = cycleProgress ? cycleProgress.remainingDays : 30;
  const daysDivider = Math.max(1, remDays);

  // Stricter Version: (available EGP cash & bank - essential remaining bills - saving target) / remaining days
  const isEssentialCategory = (name: string) => {
    const nameLower = name.toLowerCase();
    const essentialKeywords = ['kahraba', '3\'az', 'rent', 'utility', 'utilities', 'net', 'bill', 'loan', 'telephone', 'mobile', 'credit card', 'syana'];
    return essentialKeywords.some(kw => nameLower.includes(kw));
  };

  // Let's compute remaining flexible budget
  const flexibleAllocations = allocations.filter(alloc => {
    const cat = categories.find(c => c.id === alloc.categoryId);
    if (!cat) return false;
    return !isEssentialCategory(cat.name) && !cat.name.toLowerCase().includes('saving') && !cat.name.toLowerCase().includes('invest');
  });
  
  const flexiblePlanned = flexibleAllocations.reduce((acc, curr) => acc + curr.plannedAmount, 0);
  const flexibleSpent = flexibleAllocations.reduce((acc, curr) => {
    const spent = catSpent[curr.categoryId] || 0;
    return acc + spent;
  }, 0);
  const remainingFlexibleBudget = Math.max(0, flexiblePlanned - flexibleSpent);
  const budgetSafeDailySpend = remainingFlexibleBudget / daysDivider;

  // Cash-Safe: Available base-currency bank + cash + wallet balance (foreign converted)
  let liquidBalance = 0;
  accounts.forEach(acc => {
    if (acc.type === 'running' || acc.type === 'cash' || acc.type === 'wallet') {
      const bal = balancesMap[acc.id] || 0;
      const rate = acc.currency === baseCurrency ? 1 : (displayRates[acc.currency] ?? 1);
      liquidBalance += bal * rate;
    }
  });

  const essentialAllocations = allocations.filter(alloc => {
    const cat = categories.find(c => c.id === alloc.categoryId);
    if (!cat) return false;
    return isEssentialCategory(cat.name);
  });
  const essentialPlanned = essentialAllocations.reduce((acc, curr) => acc + curr.plannedAmount, 0);
  const essentialSpent = essentialAllocations.reduce((acc, curr) => {
    const spent = catSpent[curr.categoryId] || 0;
    return acc + spent;
  }, 0);
  const remainingEssentialBudget = Math.max(0, essentialPlanned - essentialSpent);

  const cashSafeDailySpend = Math.max(0, (liquidBalance - remainingEssentialBudget) / daysDivider);

  return {
    accountBalances,
    totalBaseEquivalent,
    baseCurrency,
    cycleProgress,
    spending: {
      actual: actualSpending,
      projected: projectedSpending,
      plannedBudget,
    },
    income: {
      actual: actualIncome,
      expected: expectedIncomeSum,
    },
    saving: {
      actual: actualSaving,
      target: targetSaving,
      projected: projectedSaving,
      status: savingStatus,
    },
    safeDailySpend: {
      budgetSafe: budgetSafeDailySpend,
      cashSafe: cashSafeDailySpend,
    },
    categoryStatus,
    loanCommitments,
  };
}
