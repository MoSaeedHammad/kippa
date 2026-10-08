import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, CardContent, Grid, Paper, Skeleton, Stack, Typography } from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import { useTheme } from '@mui/material/styles';
import { ArrowBackIcon, ArrowForwardIcon, BarChartIcon, CategoryIcon } from '@/components/AppIcon';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useCategories,
  useDisplayRates,
  useHouseholdBaseCurrency,
  useLedgerLines,
  useTransactions,
} from '@/hooks/useFinance';
import { monthlySpending, shiftMonth, spendingMonths } from '@/libs/spendingAnalytics';
import type { CurrencyCode } from '@kippa/domain';

const CHART_COLORS = ['primary', 'secondary', 'info', 'warning', 'success', 'error'] as const;
const MAX_SLICES = 8;
const MAX_MERCHANT_BARS = 8;

function monthLabel(month: string, locale: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon - 1, 15)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Analytics → Spending: walk month by month and see where the money went —
 * one chart per category and one per merchant/beneficiary.
 */
export function SpendingView() {
  const { t } = useTranslation('budgetCycles');
  const { i18n } = useTranslation();
  const theme = useTheme();
  const { householdId } = useAppContext();
  const baseCurrency = useHouseholdBaseCurrency();
  const { data: transactions = [], isLoading } = useTransactions(householdId);
  const { data: lines = [], isLoading: linesLoading } = useLedgerLines(householdId);
  const { data: categories = [] } = useCategories(householdId);

  // Newest-first list of months that carry posted expenses; the last entry
  // bounds how far back the user can step.
  const oldestMonth = useMemo(() => spendingMonths(transactions).at(-1), [transactions]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState<string>(currentMonth);

  const currencies = useMemo(
    () => Array.from(new Set(lines.map((line) => line.currency)).add(baseCurrency)) as CurrencyCode[],
    [lines, baseCurrency],
  );
  const { data: rates = {} } = useDisplayRates(baseCurrency, currencies.filter((code) => code !== baseCurrency));

  const spending = useMemo(
    () => monthlySpending(transactions, lines, categories, baseCurrency, rates, month),
    [transactions, lines, categories, baseCurrency, rates, month],
  );

  const loading = isLoading || linesLoading;
  const hasNextMonth = month < currentMonth;
  const hasData = spending.total > 0;

  const color = (index: number) => theme.palette[CHART_COLORS[index % CHART_COLORS.length]].main;

  const categorySlices = useMemo(() => {
    const top = spending.byCategory.slice(0, MAX_SLICES);
    const rest = spending.byCategory.slice(MAX_SLICES).reduce((sum, slice) => sum + slice.amount, 0);
    const slices = top.map((slice, index) => ({
      id: slice.key,
      label: slice.name || t('spending.uncategorized'),
      value: Number(slice.amount.toFixed(2)),
      color: color(index),
    }));
    if (rest > 0) slices.push({ id: 'other', label: t('spending.other'), value: Number(rest.toFixed(2)), color: theme.palette.action.hover });
    return slices;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spending.byCategory, t, theme]);

  const merchantBars = useMemo(() => {
    const top = spending.byMerchant.slice(0, MAX_MERCHANT_BARS);
    return {
      labels: top.map((entry) => entry.name || t('spending.unspecifiedMerchant')),
      values: top.map((entry) => Number(entry.amount.toFixed(2))),
    };
  }, [spending.byMerchant, t]);

  return (
    <Stack spacing={3}>
      <PageHeader title={t('spending.title')} subtitle={t('spending.subtitle')} />

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap spacing={1.5}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="segmented"
            disabled={Boolean(oldestMonth && month <= oldestMonth)}
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
            aria-label={t('spending.previousMonth')}
          >
            <ArrowBackIcon />
          </Button>
          <Paper variant="outlined" sx={{ px: 2.5, py: 1 }}>
            <Typography variant="sectionLabel">{monthLabel(month, i18n.language)}</Typography>
          </Paper>
          <Button
            variant="segmented"
            disabled={!hasNextMonth}
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
            aria-label={t('spending.nextMonth')}
          >
            <ArrowForwardIcon />
          </Button>
        </Stack>
        {month !== currentMonth && (
          <Button variant="text" onClick={() => setMonth(currentMonth)}>
            {t('spending.thisMonth')}
          </Button>
        )}
      </Stack>

      {loading ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={120} />
          <Skeleton variant="rounded" height={320} />
        </Stack>
      ) : !hasData ? (
        <EmptyLayout
          icon={<BarChartIcon />}
          title={t('spending.emptyTitle')}
          description={t('spending.emptyDescription')}
        />
      ) : (
        <>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="sectionLabel" color="text.secondary">{t('spending.total')}</Typography>
                    <Typography variant="amountCurrency">
                      {spending.total.toLocaleString(i18n.language, { style: 'currency', currency: baseCurrency, maximumFractionDigits: 0 })}
                    </Typography>
                    <Typography variant="fieldHint" color="text.secondary">
                      {t('spending.acrossCounts', {
                        categories: spending.byCategory.length,
                        merchants: spending.byMerchant.length,
                      })}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <Card>
                <CardContent>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <CategoryIcon color="primary" />
                    <Typography variant="cardTitle">{t('spending.byCategory')}</Typography>
                  </Stack>
                  <Box sx={{ width: '100%', height: 280 }}>
                  <PieChart
                    height={280}
                    series={[{
                      data: categorySlices,
                      innerRadius: 55,
                      paddingAngle: 2,
                      valueFormatter: (item) => `${item.label}: ${item.value.toLocaleString(i18n.language, { style: 'currency', currency: baseCurrency, maximumFractionDigits: 0 })}`,
                    }]}
                  />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <BarChartIcon color="primary" />
                <Typography variant="cardTitle">{t('spending.byMerchant')}</Typography>
              </Stack>
              <Box sx={{ width: '100%', height: 300 }}>
                <BarChart
                  height={300}
                  margin={{ top: 16, right: 16, bottom: 72, left: 56 }}
                  xAxis={[{
                    scaleType: 'band',
                    data: merchantBars.labels,
                    tickLabelStyle: { angle: -30, textAnchor: 'end', fontSize: 11 },
                  }]}
                  yAxis={[{ tickLabelStyle: { fontSize: 11 } }]}
                  series={[{
                    label: t('spending.byMerchant'),
                    data: merchantBars.values,
                    color: theme.palette.primary.main,
                  }]}
                  grid={{ horizontal: true }}
                />
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Stack>
  );
}
