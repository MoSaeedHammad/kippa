import type { Account, LedgerLine } from '@kippa/domain';

export type CurrencyBalance = { currency: string; amount: number };

export type SpaceAccountsSummary = {
  /** Active, non-virtual accounts in the space (the shared-balance mirror account is excluded). */
  accountsCount: number;
  /** Net balance per currency over posted entries. */
  balances: CurrencyBalance[];
};

/**
 * Summarizes a space's real accounts for the Spaces hub cards. The virtual
 * shared-balance mirror account is excluded — it duplicates IOU state that
 * the card already shows from the entries collection.
 */
export function summarizeSpaceAccounts(
  accounts: Pick<Account, 'id' | 'currency' | 'isActive' | 'isSharedBalance'>[],
  ledgerLines: Pick<LedgerLine, 'accountId' | 'signedAmount'>[],
): SpaceAccountsSummary {
  const activeAccounts = accounts.filter((account) => account.isActive && !account.isSharedBalance);
  const byAccount = new Map(activeAccounts.map((account) => [account.id, account]));
  const totals = new Map<string, number>();
  for (const line of ledgerLines) {
    const account = byAccount.get(line.accountId);
    if (!account) continue;
    const current = totals.get(account.currency) ?? 0;
    totals.set(account.currency, current + line.signedAmount);
  }
  return {
    accountsCount: activeAccounts.length,
    balances: [...totals.entries()]
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      .sort((left, right) => left.currency.localeCompare(right.currency)),
  };
}
