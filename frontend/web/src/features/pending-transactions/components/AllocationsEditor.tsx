import { Box, Button, Chip, MenuItem, Stack, TextField } from '@mui/material';
import type { Account } from '@kippa/domain';
import type { AllocationRow } from '../hooks/usePendingReviewState';
import { useTranslation } from 'react-i18next';

type Props = {
  accounts: Account[];
  rows: AllocationRow[];
  total: number;
  currency: string;
  onChange: (rows: AllocationRow[]) => void;
};

/**
 * Editor for splitting an approved message across several accounts. The
 * remaining chip turns green when the rows sum exactly to the message
 * amount — approval stays blocked until they do.
 */
export function AllocationsEditor({ accounts, rows, total, currency, onChange }: Props) {
  const { t } = useTranslation('pendingTransactions');
  const allocated = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const remaining = Math.round((total - allocated) * 100) / 100;
  const complete = Math.abs(remaining) < 0.01 && rows.every((row) => row.accountId && Number(row.amount) > 0);

  const update = (index: number, patch: Partial<AllocationRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <Stack spacing={1}>
      {rows.map((row, index) => (
        <Stack key={index} direction="row" spacing={1} alignItems="center">
          <TextField
            select
            size="small"
            fullWidth
            label={index === 0 ? t('allocations.account') : undefined}
            value={row.accountId}
            onChange={(event) => update(index, { accountId: event.target.value })}
          >
            {accounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={index === 0 ? t('allocations.amount') : undefined}
            value={row.amount}
            onChange={(event) => update(index, { amount: event.target.value })}
            slotProps={{ htmlInput: { inputMode: 'decimal', type: 'number' } }}
            sx={{ width: 130 }}
          />
          <Button
            size="small"
            color="error"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ✕
          </Button>
        </Stack>
      ))}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Chip
          size="small"
          variant="outlined"
          color={complete ? 'success' : 'warning'}
          label={t('allocations.remaining', { amount: remaining.toFixed(2), currency })}
        />
        <Button
          size="small"
          variant="text"
          disabled={remaining <= 0}
          onClick={() => onChange([...rows, { accountId: '', amount: remaining.toFixed(2) }])}
        >
          {t('allocations.addAccount')}
        </Button>
      </Box>
    </Stack>
  );
}
