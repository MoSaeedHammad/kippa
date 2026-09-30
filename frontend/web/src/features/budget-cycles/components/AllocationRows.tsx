import { IconButton, List, ListItem, ListItemText, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { DeleteOutlineIcon, EditIcon } from '@/components/AppIcon';

export interface AllocationRow {
  categoryId: string;
  plannedAmount: string;
}

interface AllocationRowsProps {
  rows: AllocationRow[];
  privacyMode: boolean;
  maskDigits: (value: string) => string;
  getCategoryName: (categoryId: string) => string;
  onAmountChange: (categoryId: string, value: string) => void;
  onRename: (categoryId: string) => void;
  onRemove: (categoryId: string) => void;
}

export function AllocationRows({ rows, privacyMode, maskDigits, getCategoryName, onAmountChange, onRename, onRemove }: AllocationRowsProps) {
  const { t } = useTranslation('budgetCycles');
  return (
    <List disablePadding>
      {rows.map((row) => {
        const categoryName = getCategoryName(row.categoryId);
        return (
          <ListItem
            key={row.categoryId}
            sx={{ px: 0, py: 0.5, minHeight: 48, '&:hover .allocation-actions, &:focus-within .allocation-actions': { opacity: 1 } }}
            secondaryAction={
              <Stack direction="row" alignItems="center" spacing={0.75}>
                <TextField
                  variant="standard"
                  type="number"
                  value={privacyMode && row.plannedAmount ? maskDigits(row.plannedAmount) : row.plannedAmount}
                  onChange={(event) => onAmountChange(row.categoryId, event.target.value)}
                  sx={{ width: 104 }}
                  slotProps={{ input: { disableUnderline: true }, htmlInput: { min: 0, style: { textAlign: 'end', fontWeight: 700, padding: '10px 12px' } } }}
                />
                <Stack className="allocation-actions" direction="row" spacing={0.25} sx={{ opacity: { xs: 1, md: 0 } }}>
                  <IconButton aria-label={t('allocations.renameAria', { name: categoryName })} size="small" onClick={() => onRename(row.categoryId)} sx={{ width: 30, height: 30 }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton aria-label={t('allocations.removeAria', { name: categoryName })} size="small" onClick={() => onRemove(row.categoryId)} color="error" sx={{ width: 30, height: 30 }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            }
          >
            <ListItemText primary={categoryName} slotProps={{ primary: { variant: 'body2', fontWeight: 600 } }} />
          </ListItem>
        );
      })}
    </List>
  );
}
