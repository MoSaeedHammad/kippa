import { Box, Button, Card, CardContent, Chip, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarMonthIcon, PaymentsIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts, useLedgerLines, useLoans, useTransactions } from '@/hooks/useFinance';
import { calculateAccountBalance } from '@/libs/financeCalculations';
import { getLoanProgress } from '@/libs/loanCalculations';
import { DashboardCardHeading } from './DashboardCardHeading';

export function LoanProgressCard() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { householdId } = useAppContext();
  const { data: loans = [], isLoading: loansLoading } = useLoans(householdId);
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(householdId);
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions(householdId);
  const { data: lines = [], isLoading: linesLoading } = useLedgerLines(householdId);

  if (loansLoading || accountsLoading || transactionsLoading || linesLoading) return <Skeleton variant="rounded" height={375} />;

  const candidates = loans
    .filter(loan => loan.status === 'active')
    .map(loan => ({ loan, progress: getLoanProgress(loan, transactions, lines) }))
    .sort((a, b) => (a.progress.nextDueDate ?? '').localeCompare(b.progress.nextDueDate ?? ''));
  const selected = candidates[0];

  if (!selected) return null;

  const { loan, progress } = selected;
  const account = accounts.find(item => item.id === loan.paymentAccountId);
  const accountBalance = account ? calculateAccountBalance(account.id, transactions, lines) : 0;
  const shortfall = Math.max(0, loan.installmentAmount - accountBalance);
  const shortDate = (date: string | null) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('loan.complete');

  return <Card sx={{ height: 375 }}><CardContent sx={{ height: '100%' }}><Stack justifyContent="space-between" sx={{ height: '100%' }}>
    <Stack spacing={2.5}>
      <DashboardCardHeading icon={<PaymentsIcon variant="Bulk" />} title={loan.name} subtitle={t('loan.subtitle', { count: progress.paidInstallments, total: loan.totalInstallments })} trailing={<Chip label={t('loan.paidPercent', { percent: progress.progressPercent.toFixed(0) })} color="success" />} />

      <Stack spacing={0.75}>
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${loan.totalInstallments}, minmax(2px, 1fr))`, gap: { xs: 0.25, sm: 0.375 } }}>
          {Array.from({ length: loan.totalInstallments }, (_, index) => <Paper key={index} variant={index < progress.paidInstallments ? 'loanProgressSegmentPaid' : 'loanProgressSegment'} sx={{ height: 42 }} />)}
        </Box>
        <Stack direction="row" justifyContent="space-between"><Typography variant="loanMeta" color="text.secondary">{t('loan.paidCount', { count: progress.paidInstallments })}</Typography><Typography variant="loanMeta" color="text.secondary"><Money amount={progress.remainingAmount} code={loan.currency} maxDigits={2} /> {t('loan.left')}</Typography></Stack>
      </Stack>

      <Stack direction="row" spacing={2} divider={<Box sx={{ width: '1px', bgcolor: 'divider' }} />}>
        <Box sx={{ flex: 1, minWidth: 0 }}><Typography component="div" variant="fieldHint" color="text.secondary">{t('loan.nextLabel', { date: shortDate(progress.nextDueDate) })}</Typography><Typography variant="loanMetricCompact" noWrap><Money amount={Math.min(loan.installmentAmount, progress.remainingAmount)} code={loan.currency} maxDigits={2} /></Typography></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}><Typography component="div" variant="fieldHint" color="text.secondary">{t('loan.payoffLabel', { date: shortDate(progress.payoffDate) })}</Typography><Typography variant="loanMetricCompact">{t('loan.paymentsLeft', { count: progress.remainingInstallments })}</Typography></Box>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center"><CalendarMonthIcon color={shortfall > 0 ? 'warning' : 'success'} /><Typography variant="body1">{shortfall > 0 ? <>{t('loan.add')} <Money amount={shortfall} code={loan.currency} maxDigits={2} /> {t('loan.toAccount', { name: account?.name ?? t('loan.thePaymentAccount') })}</> : t('loan.ready', { name: account?.name ?? t('loan.paymentAccount') })}</Typography></Stack>
    </Stack>

    <Button variant="contained" fullWidth onClick={() => navigate('/loans')}>{t('loan.viewLoan')}</Button>
  </Stack></CardContent></Card>;
}
