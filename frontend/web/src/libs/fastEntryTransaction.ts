import type { Account, BudgetCycle, Category } from '@kippa/domain';

export type EntryMode = 'expense' | 'income' | 'transfer';
type Input = { activeCycle: BudgetCycle | null; amountText: string; category: Category | null; createdBy: string; date: string; description: string; destinationAccount: Account | null; destinationAmountText: string; merchant?: string; mode: EntryMode; sourceAccount: Account | null };

export function buildFastEntryTransaction(input: Input) {
  const amount = Number(input.amountText);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Please enter a valid amount');
  if (!input.sourceAccount) throw new Error('Please select a From Account');
  if (input.mode !== 'transfer' && !input.category) throw new Error('Please select a category before continuing');
  const common = { date: input.date, budgetCycleId: input.activeCycle?.id ?? null, createdBy: input.createdBy, merchant: input.merchant?.trim() || null };
  if (input.mode === 'expense' || input.mode === 'income') {
    const income = input.mode === 'income';
    return { transaction: { ...common, type: input.mode, description: input.description || (income ? 'Income' : null), categoryId: input.category!.id }, lines: [{ accountId: input.sourceAccount.id, signedAmount: income ? amount : -amount, currency: input.sourceAccount.currency }] };
  }
  const destination = input.destinationAccount;
  if (!destination) throw new Error('Please select a Destination Account');
  if (destination.id === input.sourceAccount.id) throw new Error('Source and Destination accounts must be different');
  const crossCurrency = destination.currency !== input.sourceAccount.currency;
  const destinationAmount = crossCurrency ? Number(input.destinationAmountText) : amount;
  if (!Number.isFinite(destinationAmount) || destinationAmount <= 0) throw new Error('Please enter a valid destination amount');
  return {
    transaction: { ...common, type: 'transfer' as const, description: input.description || (crossCurrency ? `${input.sourceAccount.currency} to ${destination.currency} Transfer` : 'Transfer') },
    lines: [{ accountId: input.sourceAccount.id, signedAmount: -amount, currency: input.sourceAccount.currency }, { accountId: destination.id, signedAmount: destinationAmount, currency: destination.currency }],
    ...(crossCurrency ? { conversionDetails: { fromCurrency: input.sourceAccount.currency, toCurrency: destination.currency, fromAmount: amount, toAmount: destinationAmount, effectiveRate: destinationAmount / amount, rateSource: 'manual' as const } } : {}),
  };
}

/** A share of one entry amount assigned to one account. */
export type SplitAllocation = { accountId: string; amount: number };

/**
 * Splits a total equally across the given accounts, cent-exact: the rounding
 * remainder (sub-cent) is absorbed by the first account so the shares always
 * sum to the entry amount.
 */
export function equalSplitAllocations(totalAmount: number, accountIds: string[]): SplitAllocation[] {
  if (!accountIds.length) throw new Error('Add at least one account to split between');
  const cents = Math.round(totalAmount * 100);
  const shareCents = Math.floor(cents / accountIds.length);
  const remainder = cents - shareCents * accountIds.length;
  return accountIds.map((accountId, index) => ({
    accountId,
    amount: (shareCents + (index === 0 ? remainder : 0)) / 100,
  }));
}

/**
 * Builds the ledger lines for an expense/income entry split across several
 * accounts: one signed line per allocation (negative for expense), every
 * allocation positive, unique, and the total equal to the entry amount.
 */
export function buildSplitEntryLines(input: {
  totalAmount: number;
  currency: string;
  isIncome: boolean;
  allocations: SplitAllocation[];
}): { accountId: string; signedAmount: number; currency: string }[] {
  if (!input.allocations.length) throw new Error('Add at least one account to split between');
  const seen = new Set<string>();
  let sum = 0;
  for (const allocation of input.allocations) {
    if (!allocation.accountId) throw new Error('Choose an account for every split row');
    if (seen.has(allocation.accountId)) throw new Error('Each account may appear only once in the split');
    if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) throw new Error('Split amounts must be positive');
    seen.add(allocation.accountId);
    sum += allocation.amount;
  }
  if (Math.abs(sum - input.totalAmount) > 0.01) throw new Error('The split amounts must add up to the entry amount');
  return input.allocations.map((allocation) => ({
    accountId: allocation.accountId,
    signedAmount: input.isIncome ? allocation.amount : -allocation.amount,
    currency: input.currency,
  }));
}
