import { useMemo, useState } from 'react';
import { Box, Button, Card, Chip, Divider, Typography } from '@mui/material';
import type { FinanceTransaction, LedgerLine, Loan } from '@kippa/domain';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { PaymentsIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts, useActiveCycle, useLedgerLines, useLoans, useRecordLoanPaymentMutation, useTransactions } from '@/hooks/useFinance';
import { getLoanProgress } from '@/libs/loanCalculations';
import { LoanPaymentDialog } from '@/features/loans/LoanPaymentDialog';

const SKIP_STORAGE_KEY = 'kippa_loan_due_skipped';

type LoanDueItem = {
  loan: Loan;
  installmentNumber: number;
  dueDate: string;
  suggestedAmount: number;
  accountName: string | undefined;
};

function readSkipped(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SKIP_STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * Loan installments that came due, surfaced in the Approvals page next to the
 * recurring confirmations. Recording a payment reuses the loan flow (the
 * recorded amount is adjusted to the remaining balance); skip hides the item
 * for that due date.
 */
export function LoanDueCard() {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId, userProfile } = useAppContext();
  const { data: loans = [] } = useLoans(householdId);
  const { data: transactions = [] } = useTransactions(householdId);
  const { data: lines = [] } = useLedgerLines(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: activeCycle } = useActiveCycle(householdId);
  const recordPayment = useRecordLoanPaymentMutation();
  const [paying, setPaying] = useState<Loan | null>(null);
  const [skipped, setSkipped] = useState<Record<string, boolean>>(() => readSkipped());

  const today = new Date().toISOString().slice(0, 10);
  const dueItems = useMemo<LoanDueItem[]>(() => loans
    .filter((loan) => loan.status === 'active')
    .map((loan) => {
      const progress = getLoanProgress(loan, transactions as FinanceTransaction[], lines as LedgerLine[], today);
      if (!progress.isDue || progress.remainingAmount <= 0) return null;
      return {
        loan,
        installmentNumber: progress.nextInstallmentNumber,
        dueDate: progress.nextDueDate!,
        suggestedAmount: Math.min(loan.installmentAmount, progress.remainingAmount),
        accountName: accounts.find((account) => account.id === loan.paymentAccountId)?.name,
      };
    })
    .filter((item): item is LoanDueItem => item !== null && !skipped[`${item.loan.id}:${item.dueDate}`]),
  [loans, transactions, lines, accounts, today, skipped]);

  if (dueItems.length === 0) return null;

  const skip = (item: LoanDueItem) => {
    const next = { ...skipped, [`${item.loan.id}:${item.dueDate}`]: true };
    setSkipped(next);
    localStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify(next));
  };

  const pay = async (amount: number, date: string) => {
    if (!paying || !userProfile) return;
    try {
      await recordPayment.mutateAsync({
        householdId, loanId: paying.id, amount, date,
        budgetCycleId: activeCycle?.id ?? null, userId: userProfile.uid,
      });
      enqueueSnackbar(t('loanDue.toasts.recorded'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('loanDue.toasts.failed'), { variant: 'error' });
    } finally {
      setPaying(null);
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Typography variant="cardTitle">{t('loanDue.title')}</Typography>
        <Typography variant="cardSubtitle" color="text.secondary">{t('loanDue.subtitle')}</Typography>
      </Box>
      <Divider />
      {dueItems.map((item, index) => {
        const busy = recordPayment.isPending && recordPayment.variables?.loanId === item.loan.id;
        return (
          <Box key={item.loan.id}>
            <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <PaymentsIcon color="warning" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip label={t('loanDue.installmentChip', { number: item.installmentNumber, total: item.loan.totalInstallments })} size="small" variant="outlined" />
                  <Typography noWrap variant="sectionLabel" sx={{ flex: 1 }}>{item.loan.name}</Typography>
                </Box>
                <Typography noWrap variant="fieldHint" color="text.secondary">
                  {[t('loanDue.dueOn', { date: item.dueDate }), item.accountName].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Typography variant="sectionLabel" sx={{ whiteSpace: 'nowrap' }}>
                <Money amount={item.suggestedAmount} code={item.loan.currency} />
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => setPaying(item.loan)}>
                  {t('loanDue.actions.record')}
                </Button>
                <Button size="small" variant="outlined" color="error" disabled={busy} onClick={() => skip(item)}>
                  {t('loanDue.actions.skip')}
                </Button>
              </Box>
            </Box>
            {index < dueItems.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
          </Box>
        );
      })}
      <LoanPaymentDialog
        key={`loan-due-payment-${paying?.id ?? 'closed'}`}
        loan={paying}
        open={Boolean(paying)}
        busy={recordPayment.isPending}
        onClose={() => setPaying(null)}
        onSave={pay}
      />
    </Card>
  );
}
