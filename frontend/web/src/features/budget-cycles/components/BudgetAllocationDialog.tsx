import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { BudgetAllocation, BudgetCycle, Category, CurrencyCode } from '@kippa/domain';
import { Money } from '@/components/Money';
import { BudgetAllocationsConfig } from '../BudgetAllocationsConfig';

interface Props {
  allocations: BudgetAllocation[];
  categories: Category[];
  cycle: BudgetCycle | null | undefined;
  cycles: BudgetCycle[];
  currency: CurrencyCode;
  householdId: string;
  isLoading: boolean;
  isSaving: boolean;
  saveRef: React.RefObject<(() => Promise<void>) | null>;
  totalBudget: number;
  onClose: () => void;
  onSavingChange: (saving: boolean) => void;
  onTotalChange: (total: number) => void;
}

export function BudgetAllocationDialog({ allocations, categories, cycle, cycles, currency, householdId, isLoading, isSaving, saveRef, totalBudget, onClose, onSavingChange, onTotalChange }: Props) {
  const { t } = useTranslation('budgetCycles');
  const save = async () => { await saveRef.current?.(); onClose(); };
  return (
    <Dialog open={!!cycle} onClose={onClose} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { maxHeight: 'calc(100dvh - 48px)', overflow: 'hidden' } } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box>
          <Typography variant="sectionLabel">{t('allocationDialog.configureFor')}</Typography>
          <Box display="flex" alignItems="center" gap={1.5} sx={{ mt: 0.25 }}>
            <Typography variant="h3">{cycle?.name}</Typography>
            {cycle && <Chip label={cycle.status.toUpperCase()} size="small" color={cycle.status === 'open' ? 'success' : cycle.status === 'planned' ? 'primary' : 'default'} variant="outlined" />}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}><Typography variant="sectionLabel">{t('allocationDialog.totalBudget')}</Typography><Typography variant="h3" color="primary.main"><Money amount={totalBudget} code={currency} /></Typography></Box>
      </DialogTitle>
      <DialogContent>
        {cycle && (isLoading ? <Skeleton variant="rectangular" width="100%" height={300} /> : <BudgetAllocationsConfig key={`${cycle.id}-${allocations.length}`} householdId={householdId} activeCycle={cycle} categories={categories} dbAllocations={allocations} cycles={cycles} onSave={onClose} saveRef={saveRef} onSavingStatusChange={onSavingChange} onTotalBudgetChange={onTotalChange} />)}
      </DialogContent>
      <DialogActions><Button onClick={onClose} variant="outlined">{t('allocationDialog.cancel')}</Button><Button onClick={save} variant="contained" loading={isSaving}>{t('allocationDialog.save')}</Button></DialogActions>
    </Dialog>
  );
}
