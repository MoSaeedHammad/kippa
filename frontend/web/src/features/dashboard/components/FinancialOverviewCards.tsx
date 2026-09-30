import { Box, Card, CardContent, Skeleton, Stack, Typography, alpha, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Money } from '@/components/Money';
import { PaymentsIcon, WorkIcon } from '@/components/AppIcon';
import { ReceiptLongIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';
import {
  useAccounts,
  useBudgetAllocations,
  useCategories,
  useCycles,
  useDisplayRates,
  useExpectedIncomes,
  useHouseholdBaseCurrency,
  useLedgerLines,
  useTransactions,
  useLoans,
} from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { computeDashboard } from '@/libs/selectors';
import type { CurrencyCode } from '@kippa/domain';

export function FinancialOverviewCard({ variant }: { variant: 'income' | 'expense' }) {
  const { t } = useTranslation('dashboard');
  const { householdId } = useAppContext();
  const theme = useTheme();
  const { data: accounts = [], isLoading: accountsLoading } = useAccounts(householdId);
  const { data: transactions = [], isLoading: transactionsLoading } = useTransactions(householdId);
  const { data: ledgerLines = [], isLoading: ledgerLoading } = useLedgerLines(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const baseCurrency = useHouseholdBaseCurrency();
  const activeCycle = cycles.find(cycle => cycle.status === 'open') ?? null;
  const foreignCodes = Array.from(new Set(accounts.map(account => account.currency).filter(currency => currency !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCodes);
  const { data: allocations = [], isLoading: allocationsLoading } = useBudgetAllocations(householdId, activeCycle?.id);
  const { data: expectedIncomes = [], isLoading: incomesLoading } = useExpectedIncomes(householdId, activeCycle?.id);
  const { data: loans = [] } = useLoans(householdId);

  const loading = accountsLoading || transactionsLoading || ledgerLoading || allocationsLoading || incomesLoading;
  if (loading) {
    return <Skeleton variant="rounded" height={300} />;
  }

  const data = computeDashboard(accounts, transactions, ledgerLines, categories, activeCycle, allocations, expectedIncomes, displayRates, baseCurrency, loans);
  const spendingRatio = data.spending.plannedBudget > 0 ? data.spending.actual / data.spending.plannedBudget : 0;
  const meterPercent = Math.max(0, Math.min(100, Math.round(spendingRatio * 100)));
  const receivedIncomeCount = transactions.filter(transaction => transaction.status === 'posted' && transaction.type === 'income' && transaction.budgetCycleId === activeCycle?.id).length;

  return (
    <>
      {variant === 'income' && <Card sx={{ height: 375 }}>
        <CardContent sx={{ height: '100%' }}>
          <Stack sx={{ height: '100%' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <CardHeading icon={<WorkIcon variant="Bulk" />} title={t('overview.incomeTitle')} />
              <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 600 }}>{activeCycle?.name ?? t('overview.currentCycle')}</Typography>
            </Stack>

            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mt: 7 }}>
              <Box>
                <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{t('overview.totalIncome')}</Typography>
                <Typography sx={{ color: 'text.primary', fontSize: { xs: 32, lg: 38 }, fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.055em', fontVariantNumeric: 'tabular-nums' }}>
                  <Money amount={data.income.actual || data.income.expected} code={baseCurrency} />
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 9px)', gap: '4px', alignItems: 'end', pb: 0.5 }}>
                {[2, 3, 4, 6, 3, 5, 2].map((height, index) => (
                  <Box key={index} sx={{ height: height * 7, borderRadius: '3px', bgcolor: index === 3 ? 'primary.main' : alpha(theme.palette.primary.main, 0.14 + index * 0.035) }} />
                ))}
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2.5 }}>
              <MetricCapsule icon={<WorkIcon fontSize="small" />} label={t('overview.received')} value={data.income.actual} currency={baseCurrency} positive />
            </Stack>

            <Box sx={{ mt: 'auto', pt: 3, ps: 1.5, borderInlineStart: '2px solid', borderColor: 'primary.main' }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{t('overview.receivedThisCycle')}</Typography>
              <Typography sx={{ color: 'text.primary', fontSize: 15, fontWeight: 650 }}>{t('overview.incomeEntries', { count: receivedIncomeCount })}</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>}

      {variant === 'expense' && <Card sx={{ height: 375 }}>
        <CardContent sx={{ height: '100%' }}>
          <Stack sx={{ height: '100%' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <CardHeading icon={<ReceiptLongIcon variant="Bulk" />} title={t('overview.expenseTitle')} />
              <Typography sx={{ color: 'text.secondary', fontSize: 11, fontWeight: 600 }}>{activeCycle?.name ?? t('overview.currentCycle')}</Typography>
            </Stack>

            <Box sx={{ mt: 3.5 }}>
                <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>{t('overview.totalExpense')}</Typography>
              <Typography sx={{ color: 'text.primary', fontSize: { xs: 36, lg: 40 }, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.055em', fontVariantNumeric: 'tabular-nums' }}>
                <Money amount={data.spending.actual} code={baseCurrency} />
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 2 }}>
              <MetricCapsule icon={<PaymentsIcon fontSize="small" />} label={t('overview.goal')} value={data.spending.plannedBudget} currency={baseCurrency} />
              <MetricCapsule icon={<WorkIcon fontSize="small" />} label={t('overview.remaining')} value={Math.max(0, data.spending.plannedBudget - data.spending.actual)} currency={baseCurrency} positive />
            </Stack>

            <Stack direction="row" justifyContent="space-between" sx={{ mt: 'auto', mb: 1 }}>
              <Typography sx={{ color: 'text.primary', fontSize: 10 }}>0</Typography>
              <Typography sx={{ color: 'text.primary', fontSize: 10 }}>50</Typography>
              <Typography sx={{ color: 'text.primary', fontSize: 10 }}>100</Typography>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '4px' }}>
              {Array.from({ length: 24 }, (_, index) => {
                const active = index < Math.round((meterPercent / 100) * 24);
                return <Box key={index} sx={{ height: 64, minWidth: 4, borderRadius: '999px', bgcolor: active ? 'secondary.main' : alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.15 : 0.12) }} />;
              })}
            </Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{activeCycle?.name ?? t('overview.currentCycle')}</Typography>
              <Typography sx={{ color: meterPercent > 100 ? 'error.main' : 'text.primary', fontSize: 10.5, fontWeight: 650 }}>{t('overview.budgetUsed', { percent: meterPercent })}</Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>}
    </>
  );
}

function MetricCapsule({ icon, label, value, currency, positive = false }: { icon: ReactNode; label: string; value: number; currency: CurrencyCode; positive?: boolean }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ width: 'fit-content', px: 1.1, py: 0.7, borderRadius: '10px', bgcolor: 'action.hover' }}>
      <Box sx={{ color: 'text.secondary', '& svg': { width: 17, height: 17 } }}>{icon}</Box>
      <Typography sx={{ color: 'text.primary', fontSize: 10.5, fontWeight: 600 }}>{label}</Typography>
      <Typography sx={{ color: positive ? 'success.main' : 'text.secondary', fontSize: 10.5, fontWeight: 700 }}>
        <Money amount={value} code={currency} maxDigits={0} />
      </Typography>
    </Stack>
  );
}
