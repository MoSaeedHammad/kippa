import type { FinanceTransaction, LedgerLine, Loan } from '@kippa/domain';

const asUtcDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function loanInstallmentDate(loan: Loan, installmentNumber: number): string {
  const first = asUtcDate(loan.firstPaymentDate);
  const target = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + installmentNumber - 1, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(loan.dueDay, lastDay));
  return isoDate(target);
}

export function linkedLoanPayments(loan: Loan, transactions: FinanceTransaction[], lines: LedgerLine[]) {
  const lineByTransaction = new Map<string, LedgerLine[]>();
  for (const line of lines) lineByTransaction.set(line.transactionId, [...(lineByTransaction.get(line.transactionId) ?? []), line]);
  return transactions
    .filter(transaction => transaction.status === 'posted' && transaction.loanId === loan.id)
    .map(transaction => ({ transaction, amount: Math.abs((lineByTransaction.get(transaction.id) ?? []).reduce((sum, line) => sum + Math.min(0, line.signedAmount), 0)) }))
    .sort((a, b) => a.transaction.date.localeCompare(b.transaction.date));
}

export function getLoanProgress(loan: Loan, transactions: FinanceTransaction[], lines: LedgerLine[], today = new Date().toISOString().slice(0, 10)) {
  const payments = linkedLoanPayments(loan, transactions, lines);
  const paidAmount = Math.min(loan.originalTotal, (loan.openingPaidAmount ?? 0) + payments.reduce((sum, payment) => sum + payment.amount, 0));
  const paidInstallments = Math.min(loan.totalInstallments, (loan.openingPaidInstallments ?? 0) + payments.length);
  const nextInstallmentNumber = Math.min(loan.totalInstallments, paidInstallments + 1);
  const remainingAmount = Math.max(0, Number((loan.originalTotal - paidAmount).toFixed(2)));
  const nextDueDate = remainingAmount > 0 ? loanInstallmentDate(loan, nextInstallmentNumber) : null;
  return {
    payments,
    paidAmount,
    paidInstallments,
    remainingAmount,
    remainingInstallments: Math.max(0, loan.totalInstallments - paidInstallments),
    progressPercent: Math.min(100, (paidAmount / loan.originalTotal) * 100),
    nextInstallmentNumber,
    nextDueDate,
    isDue: Boolean(nextDueDate && nextDueDate <= today),
    payoffDate: loanInstallmentDate(loan, loan.totalInstallments),
  };
}

export function loanHasPaymentDueInCycle(loan: Loan, startDate: string, endDate?: string | null): boolean {
  if (loan.status !== 'active') return false;
  const fallbackEnd = asUtcDate(startDate);
  fallbackEnd.setUTCDate(fallbackEnd.getUTCDate() + 40);
  const end = endDate || isoDate(fallbackEnd);
  for (let installment = 1; installment <= loan.totalInstallments; installment += 1) {
    const due = loanInstallmentDate(loan, installment);
    if (due >= startDate && due <= end) return true;
  }
  return false;
}
