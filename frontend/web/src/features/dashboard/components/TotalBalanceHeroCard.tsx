import { Box, Card, CardContent, Chip, Skeleton, Stack, Typography } from '@mui/material';
import {
  useAccounts,
  useTransactions,
  useLedgerLines,
  useCategories,
  useCycles,
  useDisplayRates,
  useHouseholdBaseCurrency,
  useBudgetAllocations,
  useExpectedIncomes
} from '@/hooks/useFinance';
import { computeDashboard } from '@/libs/selectors';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { InfoTooltip } from '@/features/shared/components/InfoTooltip';
import { metricExplanations } from '@/features/shared/constants/metricExplanations';
import { ForeignBalanceTooltip } from '@/features/shared/components/ForeignBalanceTooltip';
import { AccountBalanceIcon } from '@/components/AppIcon';
import { DashboardCardHeading } from './DashboardCardHeading';

export function TotalBalanceHeroCard() {
  const { householdId } = useAppContext();
  const { data: accounts, isLoading: accountsLoading } = useAccounts(householdId);
  const { data: transactions, isLoading: txsLoading } = useTransactions(householdId);
  const { data: ledgerLines, isLoading: linesLoading } = useLedgerLines(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: cycles = [] } = useCycles(householdId);
  const baseCurrency = useHouseholdBaseCurrency();
  const foreignCodes = Array.from(new Set((accounts ?? []).map(a => a.currency).filter(c => c !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCodes);

  const activeCycle = cycles.find(c => c.status === 'open') || null;
  const activeCycleId = activeCycle?.id;

  const { data: allocations = [] } = useBudgetAllocations(householdId, activeCycleId);
  const { data: expectedIncomes = [] } = useExpectedIncomes(householdId, activeCycleId);

  const isLoading = accountsLoading || txsLoading || linesLoading;

  if (isLoading || !accounts || !transactions || !ledgerLines) {
    return (
      <Card sx={{ height: 375 }}><CardContent>
        <Box>
          <Skeleton variant="text" width="50%" height={24} animation="wave" />
          <Skeleton variant="text" width="80%" height={48} animation="wave" sx={{ mt: 1 }} />
        </Box>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Skeleton variant="rectangular" width="30%" height={28} sx={{ borderRadius: '16px' }} animation="wave" />
          <Skeleton variant="rectangular" width="30%" height={28} sx={{ borderRadius: '16px' }} animation="wave" />
        </Stack>
      </CardContent></Card>
    );
  }

  const data = computeDashboard(
    accounts,
    transactions,
    ledgerLines,
    categories,
    activeCycle,
    allocations,
    expectedIncomes,
    displayRates,
    baseCurrency
  );
  const balanceFor = (accountId: string) => data.accountBalances.find(item => item.accountId === accountId)?.balance ?? 0;

  return (
    <Card sx={{ height: 375 }}>
      <CardContent sx={{ height: '100%' }}>
        <Stack sx={{ minHeight: 260 }}>
          <DashboardCardHeading icon={<AccountBalanceIcon variant="Bulk" />} title="My balance" trailing={<Chip label="All accounts" />} />

          <Box sx={{ mt: 3 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
              <Box component="span">
              <InfoTooltip
                label={<span>Total balance</span>}
                text={metricExplanations.totalBaseEquivalent}
              />
              </Box>
          </Typography>
          <Typography sx={{ color: 'text.primary', fontSize: { xs: 36, lg: 40 }, lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.055em', mt: 1, fontVariantNumeric: 'tabular-nums' }}>
            <Money amount={data.totalBaseEquivalent} code={baseCurrency} maxDigits={2} />
          </Typography>
          </Box>
          
          <Box sx={{ mt: 'auto', pt: 2 }}>
            <Typography sx={{ color: 'text.secondary', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>Accounts</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
              {accounts.map(account => {
                const balance = balanceFor(account.id);
                return (
                <ForeignBalanceTooltip
                  key={account.id}
                  amount={balance}
                  currency={account.currency}
                  baseCurrency={baseCurrency}
                  rate={displayRates[account.currency]}
                >
                  <Stack
                    tabIndex={account.currency === baseCurrency ? undefined : 0}
                    sx={{
                      minWidth: 0,
                      bgcolor: 'action.hover',
                      px: 1,
                      py: 0.7,
                      borderRadius: '9px',
                      cursor: account.currency === baseCurrency ? 'default' : 'help',
                    }}
                  >
                    <Typography noWrap sx={{ color: 'text.secondary', fontSize: 9.5, fontWeight: 600 }}>
                      {account.name}
                    </Typography>
                    <Typography noWrap sx={{ color: account.type === 'credit' && balance < 0 ? 'error.main' : 'text.primary', fontSize: 11, fontWeight: 750 }}>
                      <Money amount={balance} code={account.currency} maxDigits={2} />
                    </Typography>
                  </Stack>
                </ForeignBalanceTooltip>
              );
              })}
            </Box>

          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
