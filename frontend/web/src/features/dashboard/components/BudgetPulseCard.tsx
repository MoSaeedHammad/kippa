import { Box, Card, CardContent, Chip, Skeleton, Stack, Typography, useTheme, alpha } from '@mui/material';
import { useTranslation } from 'react-i18next';
import {
  useAccounts,
  useTransactions,
  useLedgerLines,
  useCategories,
  useCycles,
  useDisplayRates,
  useHouseholdBaseCurrency,
  useBudgetAllocations,
  useExpectedIncomes,
  useLoans
} from '@/hooks/useFinance';
import { computeDashboard, DashboardData } from '@/libs/selectors';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { BarChartIcon } from '@/components/AppIcon';
import { DashboardCardHeading } from './DashboardCardHeading';

export function BudgetPulseCard() {
  const { t } = useTranslation('dashboard');
  const { householdId } = useAppContext();
  const theme = useTheme();
  const { data: accounts } = useAccounts(householdId);
  const { data: transactions } = useTransactions(householdId);
  const { data: ledgerLines } = useLedgerLines(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const baseCurrency = useHouseholdBaseCurrency();
  const foreignCodes = Array.from(new Set((accounts ?? []).map(a => a.currency).filter(c => c !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCodes);

  const activeCycle = cycles.find(c => c.status === 'open') || null;
  const activeCycleId = activeCycle?.id;

  const { data: allocations = [], isLoading: allocationsLoading } = useBudgetAllocations(householdId, activeCycleId);
  const { data: expectedIncomes = [] } = useExpectedIncomes(householdId, activeCycleId);
  const { data: loans = [] } = useLoans(householdId);

  const isLoading = allocationsLoading || !accounts || !transactions || !ledgerLines;

  const getStatusColor = (status: DashboardData['saving']['status']) => {
    if (status === 'on-track') return theme.palette.success.main;
    if (status === 'warning') return theme.palette.warning.main;
    return theme.palette.error.main;
  };

  const getStatusBgColor = (status: DashboardData['saving']['status']) => {
    if (status === 'on-track') return alpha(theme.palette.success.main, 0.1);
    if (status === 'warning') return alpha(theme.palette.warning.main, 0.1);
    return alpha(theme.palette.error.main, 0.1);
  };

  const getStatusLabel = (status: DashboardData['saving']['status']) => {
    if (status === 'on-track') return t('pulse.statusOnTrack');
    if (status === 'warning') return t('pulse.statusWarning');
    return t('pulse.statusOverBudgeting');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Skeleton variant="text" width="35%" height={24} animation="wave" />
            <Skeleton variant="rectangular" width="25%" height={24} sx={{ borderRadius: '12px' }} animation="wave" />
          </Stack>
          <Skeleton variant="rectangular" width="100%" height={8} sx={{ borderRadius: 4, mb: 1.5 }} animation="wave" />
          <Skeleton variant="text" width="70%" height={18} animation="wave" />
        </CardContent>
      </Card>
    );
  }

  const data = computeDashboard(
    accounts || [],
    transactions || [],
    ledgerLines || [],
    categories,
    activeCycle,
    allocations,
    expectedIncomes,
    displayRates,
    baseCurrency,
    loans,
  );
  const remainingPercent = data.spending.plannedBudget > 0
    ? Math.max(0, Math.round((1 - data.spending.actual / data.spending.plannedBudget) * 100))
    : 0;
  const featuredCategories = [...data.categoryStatus]
    .filter(category => category.planned > 0)
    .sort((a, b) => b.planned - a.planned)
    .slice(0, 3);

  return (
    <Card sx={{ height: 375 }}>
      <CardContent sx={{ height: '100%' }}>
        <DashboardCardHeading icon={<BarChartIcon variant="Bulk" />} title={t('pulse.title')} trailing={<Chip label={getStatusLabel(data.saving.status)} color={data.saving.status === 'on-track' ? 'success' : data.saving.status === 'warning' ? 'warning' : 'error'} />} />

        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mt: 2.5 }}>
          <Typography sx={{ color: 'text.primary', fontSize: { xs: 36, lg: 40 }, fontWeight: 500, lineHeight: 1.05, letterSpacing: '-0.055em', fontVariantNumeric: 'tabular-nums' }}>{remainingPercent}<Box component="span" sx={{ color: 'text.secondary', fontSize: '0.62em', ms: 0.75 }}>%</Box></Typography>
          <Typography sx={{ maxWidth: 150, color: 'text.secondary', fontSize: 10.5, lineHeight: 1.45 }}>
            {data.saving.status === 'on-track' ? t('pulse.goodShape') : t('pulse.ahead')}
          </Typography>
        </Stack>

        <Box sx={{ mt: 1.25, px: 1, py: 0.6, width: 'fit-content', borderRadius: '9px', bgcolor: getStatusBgColor(data.saving.status) }}>
          <Typography sx={{ color: getStatusColor(data.saving.status), fontSize: 9.5, fontWeight: 700 }}>{t('pulse.cycleProgress', { percent: data.cycleProgress ? Math.round(data.cycleProgress.ratio * 100) : 0 })}</Typography>
        </Box>

        <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ mt: 2.5, minHeight: 150 }}>
          {featuredCategories.map((category, index) => {
            const used = Math.round(category.ratio * 100);
            const remaining = Math.max(0, category.planned - category.spent);
            return (
              <Box key={category.categoryId} sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ height: 8, mb: 1, borderRadius: '999px', bgcolor: index === 0 ? 'primary.dark' : index === 1 ? 'secondary.main' : 'primary.light' }} />
                <Box sx={{ height: 120 - index * 16, p: 1.25, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRadius: '13px 13px 9px 9px', bgcolor: index === 0 ? 'primary.dark' : index === 1 ? 'secondary.main' : 'primary.light', color: index === 0 ? 'primary.contrastText' : index === 1 ? 'secondary.contrastText' : 'primary.dark' }}>
                  <Box>
                    <Typography sx={{ color: 'inherit', fontSize: used >= 100 ? 19 : 24, fontWeight: 500, lineHeight: 1 }}>{used}%</Typography>
                    <Typography noWrap sx={{ color: 'inherit', fontSize: 10.5, opacity: 0.82 }}>{category.categoryName}</Typography>
                  </Box>
                  <Typography noWrap title={t('pulse.remainingTitle', { amount: remaining.toLocaleString(), currency: baseCurrency })} sx={{ color: 'inherit', fontSize: 8.5, fontWeight: 700 }}><Money amount={remaining} code={baseCurrency} maxDigits={0} /></Typography>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
