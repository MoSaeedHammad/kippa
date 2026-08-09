import { Box, Grid, Stack } from '@mui/material';
import { HeaderSection } from '@/features/dashboard/components/HeaderSection';
import { TotalBalanceHeroCard } from '@/features/dashboard/components/TotalBalanceHeroCard';
import { BudgetPulseCard } from '@/features/dashboard/components/BudgetPulseCard';
import { BudgetBreakdownCard } from '@/features/dashboard/components/BudgetBreakdownCard';
import { MyAccountsCard } from '@/features/dashboard/components/MyAccountsCard';
import { TransactionsCard } from '@/features/dashboard/components/TransactionsCard';
import { LoanProgressCard } from '@/features/dashboard/components/LoanProgressCard';

export function Dashboard() {
  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      {/* Header Section */}
      <HeaderSection />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
          gap: { xs: 2, md: 3 },
          '& > *': { minWidth: 0 },
        }}
      >
        <TotalBalanceHeroCard />
        <LoanProgressCard />
        <BudgetPulseCard />
      </Box>

      <Grid container spacing={{ xs: 2, md: 3 }} alignItems="flex-start">
        <Grid size={{ xs: 12, md: 5 }}><MyAccountsCard /></Grid>
        <Grid size={{ xs: 12, md: 7 }}><TransactionsCard /></Grid>
      </Grid>

      <BudgetBreakdownCard />
    </Stack>
  );
}
