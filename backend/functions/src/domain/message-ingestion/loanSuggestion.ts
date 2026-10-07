import type { FinanceTransaction, Loan } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';

export function installmentDate(loan: Loan, installmentNumber: number): string {
  const first = new Date(`${loan.firstPaymentDate}T12:00:00Z`);
  const target = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + installmentNumber - 1, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(loan.dueDay, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(left: string, right: string): number {
  return Math.round(Math.abs(new Date(`${left}T12:00:00Z`).getTime() - new Date(`${right}T12:00:00Z`).getTime()) / 86_400_000);
}

export type LoanSuggestion = { loanId: string; loanName: string; installmentNumber: number };

/**
 * Pure loan-installment matcher for parsed bank messages: the loan must be
 * active, paid from the suggested account, match amount and currency, and the
 * message date must fall inside the installment's grace window. Ambiguous
 * matches (several loans) never suggest.
 */
export function matchLoanSuggestion(
  loans: Loan[],
  transactions: FinanceTransaction[],
  parsed: ParsedFinancialMessage,
  accountId?: string,
): LoanSuggestion | null {
  if (parsed.kind !== 'expense' || !accountId) return null;
  const matches = loans
    .filter((loan) => loan.status === 'active')
    .flatMap((loan) => {
      const linkedPayments = transactions.filter((transaction) => transaction.status === 'posted' && transaction.loanId === loan.id);
      const installmentNumber = (loan.openingPaidInstallments ?? 0) + linkedPayments.length + 1;
      if (loan.paymentAccountId !== accountId
        || loan.currency !== parsed.currency
        || Math.abs(loan.installmentAmount - parsed.amount) > 0.01
        || installmentNumber > loan.totalInstallments) return [];
      const dueDate = installmentDate(loan, installmentNumber);
      const allowedDays = Math.max(3, (loan.graceDay ?? loan.dueDay) - loan.dueDay + 2);
      return daysBetween(parsed.date, dueDate) <= allowedDays
        ? [{ loanId: loan.id, loanName: loan.name, installmentNumber }]
        : [];
    });
  return matches.length === 1 ? matches[0] : null;
}
