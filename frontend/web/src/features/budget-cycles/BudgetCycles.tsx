import { useState, useMemo, useRef } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Container,
  Stack,
  Typography,
  Button,
  Grid,
  Skeleton,
  IconButton,
} from '@mui/material';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { AddIcon } from '@/components/AppIcon';
import { HistoryIcon } from '@/components/AppIcon';
import {
  useCategories,
  useCycles,
  useTransactions,
  useLedgerLines,
  useAllBudgetAllocations,
  useAllExpectedIncomes,
  useAccounts,
  useDisplayRates,
  useBudgetAllocations,
  useCreateCycleMutation,
  useUpdateCycleStatusMutation,
  useHouseholdBaseCurrency
} from '@/hooks/useFinance';
import { CycleAnalytics } from '@/features/budget-cycles/CycleAnalytics';
import { useAppContext } from '@/hooks/useAppContext';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { CloseCycleDialog, CreateCycleDialog, type NewCycleValues } from './components/CycleDialogs';
import { ActiveCycleCard, CycleHistoryCard, type CycleHistoryStats } from './components/CycleCards';
import { getDaysInfo } from './cycleUtils';
import { BudgetAllocationDialog } from './components/BudgetAllocationDialog';
import { calculateCycleData } from '@/libs/budgetAnalytics';

// ── Main Component ───────────────────────────────────────────────────────

export function BudgetCycles() {
  const { householdId } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const baseCurrency = useHouseholdBaseCurrency();

  // Cycle Creation State
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [openCloseDialog, setOpenCloseDialog] = useState(false);

  // UI state — which cycle's budget is being edited (null = none)
  const [editingCycleId, setEditingCycleId] = useState<string | null>(null);
  const saveBudgetRef = useRef<(() => Promise<void>) | null>(null);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [totalBudget, setTotalBudget] = useState<number>(0);

  // Queries
  const { data: categories = [], isLoading: categoriesLoading } = useCategories(householdId);
  const { data: cycles = [], isLoading: cyclesLoading } = useCycles(householdId);

  const activeCycle = cycles.find(c => c.status === 'open') || null;

  // Fetch allocations for whichever cycle is being edited
  const { data: dbAllocations = [], isLoading: allocsLoading } = useBudgetAllocations(householdId, editingCycleId ?? undefined);

  // Per-cycle analytics (planned/spent/saved) + transaction counts for history cards.
  // Mirrors the data already computed in CycleAnalytics so no new queries beyond what
  // that panel already loads.
  const { data: transactions = [] } = useTransactions(householdId);
  const { data: ledgerLines = [] } = useLedgerLines(householdId);
  const { data: allAllocations = [] } = useAllBudgetAllocations(householdId);
  const { data: allExpectedIncomes = [] } = useAllExpectedIncomes(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const foreignCodes = Array.from(new Set(accounts.map(a => a.currency).filter(c => c !== baseCurrency)));
  const { data: displayRates = {} } = useDisplayRates(baseCurrency, foreignCodes);

  const cycleStatsById = useMemo(() => {
    const map = new Map<string, CycleHistoryStats>();
    if (cycles.length === 0) return map;
    const cycleData = calculateCycleData(cycles, transactions, ledgerLines, allAllocations, allExpectedIncomes, baseCurrency, displayRates);
    cycleData.forEach((datum) => {
      map.set(datum.id, {
        baseCurrency,
        plannedBudget: datum.plannedBudget,
        actualExpense: datum.actualExpense,
      });
    });
    return map;
  }, [cycles, transactions, ledgerLines, allAllocations, allExpectedIncomes, displayRates, baseCurrency]);

  // The cycle object being edited
  const editingCycle = editingCycleId ? cycles.find(c => c.id === editingCycleId) : null;

  // Mutations
  const createCycleMutation = useCreateCycleMutation();
  const updateCycleStatusMutation = useUpdateCycleStatusMutation();

  // Sorted cycles: planned first, then closed by start date desc
  const sortedHistory = useMemo(() => {
    return [...cycles]
      .filter(c => c.status !== 'open')
      .sort((a, b) => {
        if (a.status === 'planned' && b.status !== 'planned') return -1;
        if (b.status === 'planned' && a.status !== 'planned') return 1;
        return b.startDate.localeCompare(a.startDate);
      });
  }, [cycles]);

  const handleCreateCycle = async (values: NewCycleValues) => {
    try {
      if (values.status === 'open' && activeCycle) {
        await updateCycleStatusMutation.mutateAsync({
          householdId,
          cycleId: activeCycle.id,
          status: 'closed',
          extra: {
            endDate: new Date().toISOString().split('T')[0]
          }
        });
      }

      await createCycleMutation.mutateAsync({
        householdId,
        cycle: {
          name: values.name,
          startDate: values.startDate,
          endDate: values.endDate || null,
          status: values.status,
        }
      });

      setOpenCreateDialog(false);
      enqueueSnackbar('Statement created.', { variant: 'success' });
      return true;
    } catch (err: any) {
      enqueueSnackbar(err?.message || 'Failed to create statement.', { variant: 'error' });
      return false;
    }
  };

  const handleCloseCycle = async () => {
    if (!activeCycle) return false;
    try {
      await updateCycleStatusMutation.mutateAsync({ householdId, cycleId: activeCycle.id, status: 'closed', extra: { endDate: new Date().toISOString().split('T')[0], closedAt: new Date().toISOString() } });
      setOpenCloseDialog(false);
      return true;
    } catch (err: any) {
      enqueueSnackbar(err?.message || 'Failed to close statement.', { variant: 'error' });
      return false;
    }
  };

  const handleToggleBudgetForCycle = (cycleId: string) => {
    setEditingCycleId(prev => prev === cycleId ? null : cycleId);
  };

  const isLoading = categoriesLoading || cyclesLoading;

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 1, px: { xs: 2, sm: 3, lg: 5 } }}>
        <Stack spacing={3}>
          <Box sx={{ mt: 1 }}>
            <Skeleton variant="text" width="60%" height={32} />
            <Skeleton variant="text" width="40%" height={20} />
          </Box>
          <Skeleton variant="rectangular" width="100%" height={180} sx={{ borderRadius: '20px' }} />
          <Skeleton variant="rectangular" width="100%" height={100} sx={{ borderRadius: '20px' }} />
        </Stack>
      </Container>
    );
  }

  const activeDaysInfo = activeCycle ? getDaysInfo(activeCycle.startDate, activeCycle.endDate) : null;

  return (
    <Container maxWidth="xl" sx={{ py: 1, px: { xs: 2, sm: 3, lg: 5 } }}>
      <Stack spacing={3}>
        {/* Page Header */}
        <PageHeader
          title="Statements"
          subtitle={activeCycle
            ? `Active: ${activeCycle.name}`
            : 'No active cycle'
          }
          action={
            <IconButton
              onClick={() => setOpenCreateDialog(true)}
              sx={{
                bgcolor: 'secondary.main',
                color: 'secondary.contrastText',
                width: 40,
                height: 40,
                borderRadius: '12px',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <AddIcon sx={{ fontSize: 22 }} />
            </IconButton>
          }
        />

        <Grid container spacing={3} alignItems="flex-start">
          <Grid size={{ xs: 12, lg: 8 }}><CycleAnalytics /></Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            {activeCycle ? (
              <ActiveCycleCard
                cycle={activeCycle}
                daysInfo={activeDaysInfo!}
                onCloseCycle={() => setOpenCloseDialog(true)}
                isEditingBudget={editingCycleId === activeCycle.id}
                onToggleBudget={() => handleToggleBudgetForCycle(activeCycle.id)}
              />
            ) : (
              <EmptyLayout
                title="No active statement"
                description="Create a new cycle to start allocating budgets and tracking expenses."
                action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpenCreateDialog(true)}>New Cycle</Button>}
              />
            )}
          </Grid>
        </Grid>

        <BudgetAllocationDialog allocations={dbAllocations} categories={categories} cycle={editingCycle} cycles={cycles} currency={baseCurrency} householdId={householdId} isLoading={allocsLoading} isSaving={isSavingBudget} saveRef={saveBudgetRef} totalBudget={totalBudget} onClose={() => setEditingCycleId(null)} onSavingChange={setIsSavingBudget} onTotalChange={setTotalBudget} />

        {/* ── Cycle History Timeline ── */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <HistoryIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '15px' }}>
              Previous Cycles
            </Typography>
          </Box>

          {sortedHistory.length > 0 ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
              {sortedHistory.map(cycle => (
                <CycleHistoryCard
                  key={cycle.id}
                  cycle={cycle}
                  isEditing={editingCycleId === cycle.id}
                  onToggleBudget={() => handleToggleBudgetForCycle(cycle.id)}
                  stats={cycleStatsById.get(cycle.id)}
                />
              ))}
            </Box>
          ) : (
            <EmptyLayout
              title="No previous cycles found"
              description="Closed statements will be listed here."
            />
          )}
        </Box>
      </Stack>

      <CreateCycleDialog
        busy={createCycleMutation.isPending || updateCycleStatusMutation.isPending}
        onClose={() => setOpenCreateDialog(false)}
        onCreate={handleCreateCycle}
        open={openCreateDialog}
      />
      <CloseCycleDialog
        busy={updateCycleStatusMutation.isPending}
        onClose={() => setOpenCloseDialog(false)}
        onConfirm={handleCloseCycle}
        open={openCloseDialog}
      />
    </Container>
  );
}
