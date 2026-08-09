import { useEffect } from 'react';
import { useSnackbar } from 'notistack';
import { useAccounts, useLedgerLines, useLoans, useTransactions } from '@/hooks/useFinance';
import { calculateAccountBalances } from '@/libs/financeCalculations';
import { getLoanProgress } from '@/libs/loanCalculations';
import { useAppContext } from '@/hooks/useAppContext';

const daysBetween = (from: string, to: string) => Math.ceil((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);

/** Free, client-side reminder: runs when Kippa is opened and never invokes a Cloud Function. */
export function useLoanReminders() {
  const { householdId } = useAppContext(); const { enqueueSnackbar } = useSnackbar();
  const { data: loans = [] } = useLoans(householdId); const { data: accounts = [] } = useAccounts(householdId); const { data: transactions = [] } = useTransactions(householdId); const { data: lines = [] } = useLedgerLines(householdId);
  useEffect(() => {
    if (!householdId || !loans.length || !accounts.length) return;
    const today = new Date().toISOString().slice(0, 10); const balances = calculateAccountBalances(accounts, transactions, lines);
    for (const loan of loans.filter(item => item.status === 'active')) {
      const progress = getLoanProgress(loan, transactions, lines, today); if (!progress.nextDueDate) continue;
      const days = daysBetween(today, progress.nextDueDate); const balance = balances[loan.paymentAccountId] ?? 0; const shortfall = Math.max(0, loan.installmentAmount - balance);
      if (days < 0 || days > 3 || shortfall <= 0) continue;
      const key = `kippa:loan-reminder:${householdId}:${loan.id}:${progress.nextDueDate}`; if (localStorage.getItem(key)) continue;
      const message = `${loan.name}: add ${shortfall.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${loan.currency} before ${progress.nextDueDate}.`;
      enqueueSnackbar(message, { variant: 'warning', persist: true }); localStorage.setItem(key, new Date().toISOString());
      if (Notification.permission === 'granted' && 'serviceWorker' in navigator) void navigator.serviceWorker.ready.then(registration => registration.showNotification('Loan account needs funding', { body: message, tag: key }));
    }
  }, [accounts, enqueueSnackbar, householdId, lines, loans, transactions]);
}
