import { Account, Card, Category, CurrencyCode, FinanceTransaction, LedgerLine } from '@kippa/domain';
import { getTransactionLines, getTransferLines } from './financeCalculations';
import { getBank } from '@/features/cards/banks/banks';

/** Message providers (ingestion) → bank preset ids. */
const PROVIDER_BANK_IDS: Record<string, string> = {
  'hsbc': 'hsbc',
  'bank-misr': 'banque-misr',
  'banque-misr': 'banque-misr',
  'cib': 'cib',
  'nbe': 'nbe',
  'qnb': 'qnb',
};

export function providerBankName(provider: string | null | undefined): string | undefined {
  if (!provider || provider === 'manual' || provider === 'custom') return undefined;
  return getBank(PROVIDER_BANK_IDS[provider.toLowerCase()] ?? provider)?.name;
}

/** One labeled fact for the approval-style subtitle: `Bank · Type · Date · •• last4 · Merchant · Category`. */
export type TransactionSubtitleParts = {
  bank?: string;
  /** Card ••last4 or account-type specifier. */
  specifier?: string;
  date?: string;
  merchant?: string;
  category?: string;
};

/**
 * Assembles every subtitle fact available for a transaction. Empty strings are
 * omitted; the caller composes the display line and supplies localized labels
 * (type) itself.
 */
export function getTransactionSubtitleParts(
  transaction: FinanceTransaction,
  ledgerLines: LedgerLine[],
  accounts: Account[],
  cards: Card[],
  categories: Category[],
): TransactionSubtitleParts {
  const lines = getTransactionLines(transaction.id, ledgerLines);
  const primaryLine = lines.find((line) => line.signedAmount !== 0) ?? lines[0];
  const account = accounts.find((item) => item.id === primaryLine?.accountId);
  const card = cards.find((candidate) => candidate.parentAccountId === account?.id && candidate.last4);
  const category = categories.find((candidate) => candidate.id === transaction.categoryId);

  const parts: TransactionSubtitleParts = {
    bank: providerBankName(transaction.importedFrom?.provider)
      ?? (card ? getBank(card.bankId)?.name : undefined),
    specifier: card?.last4 ? `•• ${card.last4}` : undefined,
    date: transaction.date,
    merchant: transaction.merchant ?? undefined,
    category: category?.name,
  };
  return parts;
}

/** Joins subtitle parts with a middle dot for display. */
export function joinSubtitleParts(parts: (string | undefined)[], typeLabel?: string): string {
  return [typeLabel, ...parts].filter((value): value is string => Boolean(value?.trim())).join(' · ');
}

export function getTransactionPresentation(transaction: FinanceTransaction, ledgerLines: LedgerLine[], accounts: Account[], baseCurrency: CurrencyCode) {
  const lines = getTransactionLines(transaction.id, ledgerLines);
  const primaryLine = lines.find((line) => line.signedAmount !== 0) ?? lines[0];
  const amount = primaryLine ? Number(Math.abs(primaryLine.signedAmount).toFixed(2)) : 0;
  const currency = primaryLine?.currency ?? baseCurrency;
  const isIncome = transaction.type === 'income' || (transaction.type === 'adjustment' && (primaryLine?.signedAmount ?? 0) >= 0);
  const account = accounts.find((item) => item.id === primaryLine?.accountId);
  const transfer = getTransferLines(lines);
  const isCrossCurrencyTransfer = !!transfer.source && !!transfer.destination && transfer.source.currency !== transfer.destination.currency;

  let details = account?.name ?? 'Account';
  if (transaction.type === 'transfer') {
    const sourceAccount = accounts.find((item) => item.id === transfer.source?.accountId);
    const destinationAccount = accounts.find((item) => item.id === transfer.destination?.accountId);
    details = isCrossCurrencyTransfer
      ? `${Math.abs(transfer.source!.signedAmount)} ${transfer.source!.currency} (${sourceAccount?.name ?? 'Wallet'}) ➔ ${Math.abs(transfer.destination!.signedAmount)} ${transfer.destination!.currency} (${destinationAccount?.name ?? 'Bank'})`
      : `${sourceAccount?.name ?? 'Wallet'} ➔ ${destinationAccount?.name ?? 'Bank'}`;
  }

  return { amount, currency, details, isCrossCurrencyTransfer, isIncome, isCreditCard: transaction.type === 'expense' && account?.type === 'credit' };
}
