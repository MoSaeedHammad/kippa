import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box, 
  Card, 
  CardContent, 
  Stack, 
  Typography, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Tabs,
  Tab,
  useTheme,
  alpha
} from '@mui/material';
import { BarChartIcon } from '@/components/AppIcon';
import { LineChart } from '@mui/x-charts/LineChart';
import {
  useCycles,
  useTransactions,
  useLedgerLines,
  useCategories,
  useAccounts,
  useDisplayRates,
  useHouseholdBaseCurrency,
  useAllBudgetAllocations,
  useAllExpectedIncomes,
  useLoans
} from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { buildCashFlowSeries, calculateCategoryTrends, calculateCycleData } from '@/libs/budgetAnalytics';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { AnalyticsPlaceholder } from './components/AnalyticsPlaceholder';

export function CycleAnalytics() {
  const { t } = useTranslation('budgetCycles');
  const { householdId } = useAppContext();
  const theme = useTheme();
  
  // Queries
  const { data: cycles = [], isLoading: cyclesLoading } = useCycles(householdId);
  const { data: transactions = [], isLoading: txsLoading } = useTransactions(householdId);
  const { data: ledgerLines = [], isLoading: linesLoading } = useLedgerLines(householdId);
  const { data: categories = [], isLoading: categoriesLoading } = useCategories(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const baseCurrency = useHouseholdBaseCurrency();
  const foreignCodes = Array.from(new Set(accounts.map(a => a.currency).filter(c => c !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCodes);
  const { data: allAllocations = [], isLoading: allocsLoading } = useAllBudgetAllocations(householdId);
  const { data: allExpectedIncomes = [], isLoading: incomesLoading } = useAllExpectedIncomes(householdId);
  const { data: loans = [], isLoading: loansLoading } = useLoans(householdId);

  // Tab State
  const [activeTab, setActiveTab] = useState(0);

  // Selected Category for Line Trend Chart
  const [selectedCategoryId, setSelectedCategoryId] = useState('masrof-bet');

  const isLoading = cyclesLoading || txsLoading || linesLoading || categoriesLoading || allocsLoading || incomesLoading || loansLoading;

  // Chronologically sorted active or closed cycles
  const sortedCycles = useMemo(() => {
    return [...cycles]
      .filter(c => c.status === 'open' || c.status === 'closed')
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [cycles]);

  // Compute stats per cycle
  const cycleData = useMemo(() => {
    if (isLoading || sortedCycles.length === 0) return [];
    return calculateCycleData(sortedCycles, transactions, ledgerLines, allAllocations, allExpectedIncomes, baseCurrency, displayRates, loans);
  }, [isLoading, sortedCycles, transactions, ledgerLines, allAllocations, allExpectedIncomes, displayRates, baseCurrency, loans]);

  // Compute category trends over cycles
  const categoryTrends = useMemo(() => {
    if (isLoading || sortedCycles.length === 0 || !selectedCategoryId) return [];

    return calculateCategoryTrends(sortedCycles, transactions, ledgerLines, selectedCategoryId, baseCurrency, displayRates);
  }, [isLoading, sortedCycles, transactions, ledgerLines, selectedCategoryId, displayRates, baseCurrency]);

  const expenseCategories = useMemo(() => {
    return categories.filter(c => c.type === 'expense');
  }, [categories]);

  const cashFlowSeries = useMemo(() => buildCashFlowSeries(cycleData), [cycleData]);

  if (isLoading) {
    return <AnalyticsPlaceholder loading />;
  }

  if (cycleData.length === 0) {
    return <AnalyticsPlaceholder loading={false} />;
  }

  return (
    <Card sx={{ height: '100%', overflow: 'hidden' }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header & Tabs */}
        <Box sx={{ mb: 1 }}>
          <CardHeading
            icon={<BarChartIcon variant="Bulk" />}
            title={t('analytics.title')}
            trailing={
              <Tabs
                value={activeTab}
                onChange={(_, val) => setActiveTab(val)}
                sx={{
                  minHeight: 36,
                  '& .MuiTabs-indicator': { display: 'none' },
                  '& .MuiTab-root': {
                    minHeight: 32, py: 0.5, px: 2, borderRadius: '16px', fontSize: '13px', fontWeight: 'bold', textTransform: 'none', color: 'text.secondary', transition: 'all 0.2s ease',
                    '&.Mui-selected': { color: 'secondary.contrastText', bgcolor: 'secondary.main' },
                    '&:hover:not(.Mui-selected)': { bgcolor: 'action.hover' },
                  },
                }}
              >
                <Tab label={t('analytics.cashFlowTab')} id="analytics-tab-0" />
                <Tab label={t('analytics.categoryTrendsTab')} id="analytics-tab-1" />
              </Tabs>
            }
          />
        </Box>

        {/* Tab Panel 0: Cash Flow Bar Chart */}
        {activeTab === 0 && (
          <Box>
            <Stack
              direction="row"
              spacing={{ xs: 1.5, sm: 2.5 }}
              useFlexGap
              flexWrap="wrap"
              alignItems="center"
              sx={{ minHeight: 44, mb: 0.5 }}
            >
              {[
                { labelKey: 'spent' as const, color: theme.palette.secondary.main },
                { labelKey: 'retained' as const, color: theme.palette.primary.dark },
                { labelKey: 'planSpace' as const, color: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.22 : 0.1) },
              ].map(item => (
                <Stack key={item.labelKey} direction="row" spacing={0.75} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: item.color }} />
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>{t(`analytics.${item.labelKey}`)}</Typography>
                </Stack>
              ))}
              <Typography variant="body2" sx={{ color: 'text.secondary', ml: { sm: 'auto' } }}>
                {t('analytics.cashFlowCaption')}
              </Typography>
            </Stack>

            <Box sx={{ width: '100%', overflowX: 'auto', pb: 0.5 }}>
              <Box
                role="img"
                aria-label={t('analytics.cashFlowAria', { currency: baseCurrency })}
                sx={{
                  height: { xs: 300, sm: 360 },
                  minWidth: Math.max(620, cycleData.length * 92),
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: { xs: 1, sm: 1.5 },
                  px: 1,
                  pt: 4,
                  pb: 4,
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: '47%',
                    borderTop: '1px dashed',
                    borderColor: alpha(theme.palette.primary.main, 0.55),
                    pointerEvents: 'none',
                  }}
                />

                {cycleData.map((cycle, index) => {
                  const capacity = cashFlowSeries.spend[index] + cashFlowSeries.retained[index] + cashFlowSeries.planGap[index] || 1;
                  const incomeHeight = Math.max(4, Math.min(100, (cycle.actualIncome / capacity) * 100));
                  const spendHeight = Math.max(3, Math.min(100, (cycle.actualExpense / capacity) * 100));
                  const capacityHeight = Math.max(34, Math.min(100, (capacity / Math.max(...cycleData.map(item => Math.max(item.expectedIncome, item.plannedBudget, item.actualIncome, item.actualExpense, 1)))) * 100));

                  return (
                    <Box
                      key={cycle.id}
                      sx={{
                        flex: '1 1 0',
                        minWidth: 54,
                        height: '100%',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        '&:hover .flow-tooltip, &:focus-within .flow-tooltip': { opacity: 1, transform: 'translate(-50%, -8px)' },
                      }}
                    >
                      <Box
                        tabIndex={0}
                        aria-label={t('analytics.barAria', { name: cycle.name, income: cycle.actualIncome.toLocaleString(), spent: cycle.actualExpense.toLocaleString(), currency: baseCurrency })}
                        sx={{
                          width: '100%',
                          height: `${capacityHeight}%`,
                          maxWidth: 76,
                          minHeight: 84,
                          position: 'relative',
                          overflow: 'hidden',
                          borderRadius: '18px 18px 12px 12px',
                          bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.075),
                          backgroundImage: `repeating-linear-gradient(135deg, transparent 0 9px, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.07)} 9px 11px)`,
                          outline: 'none',
                        }}
                      >
                        <Box
                          sx={{
                            position: 'absolute',
                            insetInline: 0,
                            bottom: 0,
                            height: `${incomeHeight}%`,
                            minHeight: 5,
                            bgcolor: 'primary.dark',
                            borderRadius: '14px 14px 10px 10px',
                            transition: 'height 300ms ease',
                          }}
                        />
                        <Box
                          sx={{
                            position: 'absolute',
                            insetInline: 0,
                            bottom: 0,
                            height: `${spendHeight}%`,
                            minHeight: 4,
                            bgcolor: 'secondary.main',
                            borderRadius: '14px 14px 10px 10px',
                            transition: 'height 300ms ease',
                          }}
                        />
                      </Box>

                      <Box
                        className="flow-tooltip"
                        sx={{
                          position: 'absolute',
                          zIndex: 2,
                          left: '50%',
                          bottom: `${Math.min(88, capacityHeight)}%`,
                          opacity: 0,
                          transform: 'translate(-50%, 0)',
                          transition: 'opacity 160ms ease, transform 160ms ease',
                          bgcolor: 'text.primary',
                          color: 'background.paper',
                          borderRadius: '12px',
                          px: 1.5,
                          py: 1,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                          boxShadow: 3,
                        }}
                      >
                        <Typography sx={{ color: 'inherit', fontSize: '10px', opacity: 0.72 }}>{t('analytics.income')}</Typography>
                        <Typography sx={{ color: 'inherit', fontSize: '14px', fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>
                          {cycle.actualIncome.toLocaleString()} {baseCurrency}
                        </Typography>
                      </Box>

                      <Typography
                        variant="body2"
                        title={cycle.name}
                        sx={{
                          position: 'absolute',
                          top: 'calc(100% + 10px)',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '100%',
                          color: 'text.secondary',
                          textAlign: 'center',
                          fontSize: '10px',
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cycle.name}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        )}

        {/* Tab Panel 1: Category Line Chart */}
        {activeTab === 1 && (
          <Box>
            <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
              <FormControl sx={{ width: 180 }}>
                <InputLabel id="trend-cat-select-label">{t('analytics.category')}</InputLabel>
                <Select
                  labelId="trend-cat-select-label"
                  value={selectedCategoryId}
                  label={t('analytics.category')}
                  onChange={e => setSelectedCategoryId(e.target.value)}
                  sx={{ borderRadius: '8px' }}
                >
                  {expenseCategories.map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            
            <Box sx={{ height: { xs: 300, sm: 380 }, width: '100%' }}>
              {categoryTrends.length > 0 && (
                <LineChart
                  xAxis={[{ 
                    scaleType: 'point', 
                    data: categoryTrends.map(t => t.cycleName) 
                  }]}
                  series={[
                    { 
                      data: categoryTrends.map(t => t.spent),
                      label: t('analytics.spentSeries'),
                      color: theme.palette.primary.main,
                      area: true,
                      curve: 'catmullRom',
                      showMark: false,
                      valueFormatter: value => `${value?.toLocaleString() ?? 0} ${baseCurrency}`,
                    }
                  ]}
                  height={370}
                  margin={{ top: 20, bottom: 40, left: 60, right: 20 }}
                  grid={{ horizontal: true }}
                  slotProps={{
                    legend: {
                      direction: 'row',
                      position: { vertical: 'bottom', horizontal: 'center' },
                      padding: -5
                    } as any
                  }}
                  sx={{
                    '& .MuiAreaElement-root': {
                      fill: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.1),
                    },
                    '& .MuiLineElement-root': {
                      strokeWidth: 3,
                    },
                    '& .MuiChartsGrid-line': {
                      stroke: alpha(theme.palette.text.primary, 0.07),
                      strokeDasharray: '3 5',
                    },
                    '& .MuiChartsAxis-line': {
                      stroke: theme.palette.divider,
                      strokeWidth: 1,
                    },
                    '& .MuiChartsAxis-tick': {
                      stroke: theme.palette.divider,
                    },
                    '& .MuiChartsAxis-tickLabel text': {
                      fill: `${theme.palette.text.secondary} !important`,
                      fontSize: '11px !important',
                    },
                    '& .MuiChartsLegend-root text': {
                      fill: `${theme.palette.text.primary} !important`,
                      fontSize: '12px !important',
                    }
                  }}
                />
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
