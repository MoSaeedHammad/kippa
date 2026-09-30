
import { Box, Card, CardContent, Chip, Skeleton, Stack, Typography, useTheme, LinearProgress, alpha } from '@mui/material';
import {
  useAccounts,
  useTransactions,
  useLedgerLines,
  useCategories,
  useCycles,
  useDisplayRates,
  useHouseholdBaseCurrency,
  useBudgetAllocations,
  useLoans
} from '@/hooks/useFinance';
import { computeDashboard } from '@/libs/selectors';
import { useAppContext } from '@/hooks/useAppContext';
import { useTranslation } from 'react-i18next';
import { Money } from '@/components/Money';
import { usePrivacyMask } from '@/hooks/usePrivacyMask';
import { BarChartIcon, PaymentsIcon, SavingsIcon } from '@/components/AppIcon';
import { CategoryIcon } from '@/components/AppIcon';
import { DashboardCardHeading } from './DashboardCardHeading';
import { CategoryPaceChart } from './CategoryPaceChart';

const formatMaskedValue = (value: number, mask: (value: string) => string) => mask(Math.round(value).toLocaleString());

export function BudgetBreakdownCard() {
  const { t } = useTranslation('dashboard');
  const { householdId } = useAppContext();
  const theme = useTheme();
  const { maskNumber } = usePrivacyMask();

  const chartColors = theme.palette.chart.colors;
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: transactions } = useTransactions(householdId);
  const { data: ledgerLines } = useLedgerLines(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const baseCurrency = useHouseholdBaseCurrency();
  const foreignCodes = Array.from(new Set(accounts.map(a => a.currency).filter(c => c !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCodes);

  const activeCycle = cycles.find(c => c.status === 'open') || null;
  const activeCycleId = activeCycle?.id;

  const { data: allocations, isLoading: allocsLoading } = useBudgetAllocations(householdId, activeCycleId);
  const { data: loans = [] } = useLoans(householdId);

  const isLoading = allocsLoading || !transactions || !ledgerLines;

  if (isLoading) {
    return (
      <Box>
        <Skeleton variant="text" width="40%" height={24} animation="wave" sx={{ mb: 1.5 }} />
        <Skeleton variant="rectangular" width="100%" height={150} sx={{ borderRadius: '20px' }} animation="wave" />
      </Box>
    );
  }

  const data = computeDashboard(
    [],
    transactions || [],
    ledgerLines || [],
    categories,
    activeCycle,
    allocations || [],
    [],
    displayRates,
    baseCurrency,
    loans,
  );

  const totalPlanned = data.categoryStatus.reduce((sum, cat) => sum + cat.planned, 0);
  const totalSpent = data.categoryStatus.reduce((sum, cat) => sum + cat.spent, 0);
  const totalRemaining = totalPlanned - totalSpent;
  const spentPercent = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <DashboardCardHeading icon={<CategoryIcon variant="Bulk" />} title={t('breakdown.title')} subtitle={t('breakdown.subtitle')} trailing={activeCycle ? <Chip label={activeCycle.name} /> : undefined} />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {[
              { id: 'planned', label: t('breakdown.plannedBudget'), value: totalPlanned, valueColor: 'text.primary', accent: theme.palette.secondary.main, meta: t('breakdown.allocationsMeta', { count: data.categoryStatus.length }), Icon: PaymentsIcon },
              { id: 'spent', label: t('breakdown.totalSpent'), value: totalSpent, valueColor: totalSpent > totalPlanned ? 'error.main' : 'text.primary', accent: totalSpent > totalPlanned ? theme.palette.error.main : theme.palette.primary.main, meta: t('breakdown.spentPercentMeta', { percent: spentPercent }), Icon: BarChartIcon },
              { id: 'remaining', label: totalRemaining < 0 ? t('breakdown.overBudget') : t('breakdown.remaining'), value: Math.abs(totalRemaining), valueColor: totalRemaining < 0 ? 'error.main' : 'success.main', accent: totalRemaining < 0 ? theme.palette.error.main : theme.palette.success.main, meta: totalRemaining < 0 ? t('breakdown.requiresAttention') : t('breakdown.availableToSpend'), Icon: SavingsIcon },
            ].map(metric => (
              <Box
                key={metric.id}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  py: 1,
                  px: { xs: 0, sm: 1 },
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ color: 'text.secondary', fontSize: 10.5, fontWeight: 650 }}>{metric.label}</Typography>
                    <Typography noWrap sx={{ color: metric.valueColor, fontSize: 19, lineHeight: 1.25, fontWeight: 780, mt: 0.5, fontVariantNumeric: 'tabular-nums' }}>
                      <Money amount={metric.value} code={baseCurrency} maxDigits={0} />
                    </Typography>
                  </Box>
                  <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '10px', display: 'grid', placeItems: 'center', color: metric.accent, bgcolor: alpha(metric.accent, 0.1) }}>
                    <metric.Icon fontSize="small" />
                  </Box>
                </Stack>
                <Typography noWrap sx={{ color: 'text.secondary', fontSize: 9.5, fontWeight: 600, mt: 1.25 }}>{metric.meta}</Typography>
              </Box>
            ))}
          </Stack>

          {data.loanCommitments.length > 0 && <Stack spacing={1.5}>
            <Typography variant="sectionLabel">{t('breakdown.fixedCommitments')}</Typography>
            {data.loanCommitments.map(commitment => <Stack key={commitment.loanId} direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1}>
              <Stack direction="row" alignItems="center" spacing={1}><PaymentsIcon color="primary" /><Box><Typography variant="body1">{commitment.loanName}</Typography><Typography variant="body2" color="text.secondary">{t('breakdown.includedInCycle')}</Typography></Box></Stack>
              <Chip label={commitment.paid > 0 ? t('breakdown.paidAmount', { amount: commitment.paid.toLocaleString(), currency: baseCurrency }) : t('breakdown.dueAmount', { amount: commitment.planned.toLocaleString(), currency: baseCurrency })} color={commitment.paid >= commitment.planned ? 'success' : 'warning'} />
            </Stack>)}
          </Stack>}

          <CategoryPaceChart categories={data.categoryStatus} />

          <Stack spacing={1.5} aria-label={t('breakdown.detailsAria')}>
            <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: 'minmax(140px, 1.4fr) minmax(150px, 1fr) repeat(3, minmax(84px, .7fr))', gap: 2, px: 1 }}>
              {[t('breakdown.colCategory'), t('breakdown.colProgress'), t('breakdown.colPlanned'), t('breakdown.colSpent'), t('breakdown.colRemaining')].map((label, index) => (
                <Typography key={index} sx={{ fontSize: 10.5, lineHeight: '16px', fontWeight: 700, color: 'text.secondary', textAlign: index > 1 ? 'right' : 'left' }}>{label}</Typography>
              ))}
            </Box>

            {data.categoryStatus.length === 0 ? (
              <Typography align="center" sx={{ py: 4, color: 'text.secondary', fontSize: 12 }}>{t('breakdown.empty')}</Typography>
            ) : (
              data.categoryStatus.map((cat, idx) => {
                    const remaining = cat.planned - cat.spent;
                    const isOver = remaining < 0;
                    const percent = cat.planned > 0 ? (cat.spent / cat.planned) * 100 : (cat.spent > 0 ? 100 : 0);
                    const catColor = chartColors[idx % chartColors.length];

                    const getCategoryStatusColor = (status: 'on-track' | 'warning' | 'over') => {
                      if (status === 'on-track') return theme.palette.success.main;
                      if (status === 'warning') return theme.palette.warning.main;
                      return theme.palette.error.main;
                    };

                    const statusColor = getCategoryStatusColor(cat.status);

                    return (
                      <Box key={cat.categoryId} sx={{ px: 1, py: 1, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(140px, 1.4fr) minmax(150px, 1fr) repeat(3, minmax(84px, .7fr))' }, gap: { xs: 1.5, md: 2 }, alignItems: 'center' }}>
                          <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: catColor, flexShrink: 0 }} />
                            <Typography noWrap sx={{ fontSize: 12, lineHeight: '18px', fontWeight: 700, color: 'text.primary' }}>{cat.categoryName}</Typography>
                          </Stack>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <LinearProgress variant="determinate" value={Math.min(100, percent)} sx={{ flex: 1, '& .MuiLinearProgress-bar': { bgcolor: statusColor } }} />
                            <Typography sx={{ minWidth: 34, textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: 'text.secondary' }}>{Math.round(percent)}%</Typography>
                          </Stack>
                          <Box sx={{ display: { xs: 'grid', md: 'contents' }, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
                            {[
                              { label: t('breakdown.colPlanned'), value: formatMaskedValue(cat.planned, maskNumber), color: 'text.primary' },
                              { label: t('breakdown.colSpent'), value: cat.spent > 0 ? formatMaskedValue(cat.spent, maskNumber) : '—', color: cat.spent > 0 ? 'text.primary' : 'text.disabled' },
                              { label: t('breakdown.colRemaining'), value: `${isOver ? '' : '+'}${formatMaskedValue(remaining, maskNumber)}`, color: isOver ? 'error.main' : remaining > 0 ? 'success.main' : 'text.secondary' },
                            ].map((item, index) => (
                              <Box key={index} sx={{ minWidth: 0, textAlign: { xs: 'left', md: 'right' } }}>
                                <Typography sx={{ display: { md: 'none' }, fontSize: 9.5, lineHeight: '14px', fontWeight: 600, color: 'text.secondary' }}>{item.label}</Typography>
                                <Typography noWrap sx={{ fontSize: 11.5, lineHeight: '18px', fontWeight: 700, color: item.color, fontVariantNumeric: 'tabular-nums' }}>{item.value}</Typography>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      </Box>
                    );
                  })
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
