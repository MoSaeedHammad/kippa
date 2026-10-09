import { CurrencyCode, FinanceTransaction, LedgerLine } from '@kippa/domain';

export type EditableTransactionType = 'income' | 'expense';

export interface TransactionEditFields {
  description: string;
  date: string;
  categoryId: string;
  accountId: string;
  amount: string;
  type: EditableTransactionType;
  merchant: string;
}

export function findPrimaryLedgerLine(transactionId: string, ledgerLines: LedgerLine[]) {
  const transactionLines = ledgerLines.filter((line) => line.transactionId === transactionId);
  return transactionLines.find((line) => line.signedAmount !== 0) ?? transactionLines[0];
}

export function createTransactionEditFields(transaction: FinanceTransaction, ledgerLines: LedgerLine[]): TransactionEditFields {
  const primaryLine = findPrimaryLedgerLine(transaction.id, ledgerLines);
  return {
    description: transaction.description ?? '',
    date: transaction.date,
    categoryId: transaction.categoryId ?? '',
    accountId: primaryLine?.accountId ?? '',
    amount: primaryLine ? Number(Math.abs(primaryLine.signedAmount).toFixed(2)).toString() : '0',
    type: transaction.type === 'income' ? 'income' : 'expense',
    merchant: transaction.merchant ?? '',
  };
}

export function resolveEditedSignedAmount(amount: number, type: EditableTransactionType, originalLine: LedgerLine | undefined, isRegular: boolean) {
  if (isRegular) return type === 'income' ? amount : -amount;
  return amount * (originalLine && originalLine.signedAmount >= 0 ? 1 : -1);
}

export function resolveEditedCurrency(originalLine: LedgerLine | undefined, baseCurrency: CurrencyCode): CurrencyCode {
  return originalLine?.currency ?? baseCurrency;
}
