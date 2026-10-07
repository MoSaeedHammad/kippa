import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from '@mui/material';

const ACCOUNT_TYPES = ['running', 'savings', 'cash', 'wallet', 'credit'] as const;

type CreateCategoryDialogProps = {
  open: boolean;
  busy: boolean;
  categoryType: 'expense' | 'income';
  onClose: () => void;
  onCreate: (name: string) => void;
};

/** Inline category creation from the pending-review dialog. */
export function CreateCategoryDialog({ open, busy, categoryType, onClose, onCreate }: CreateCategoryDialogProps) {
  const { t } = useTranslation('pendingTransactions');
  const [name, setName] = useState('');
  const close = () => {
    setName('');
    onClose();
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="xs">
      <DialogTitle>{t('createCategory.title', { type: t(`createCategory.${categoryType}`) })}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={t('createCategory.nameLabel')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 60 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={close} disabled={busy}>{t('imported.back')}</Button>
        <Button variant="contained" disabled={busy || !name.trim()} onClick={() => onCreate(name.trim())}>{t('createCategory.create')}</Button>
      </DialogActions>
    </Dialog>
  );
}

type CreateAccountDialogProps = {
  open: boolean;
  busy: boolean;
  defaultCurrency: string;
  onClose: () => void;
  onCreate: (input: { name: string; type: (typeof ACCOUNT_TYPES)[number]; currency: string }) => void;
};

/** Inline account creation from the pending-review dialog. */
export function CreateAccountDialog({ open, busy, defaultCurrency, onClose, onCreate }: CreateAccountDialogProps) {
  const { t } = useTranslation('pendingTransactions');
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof ACCOUNT_TYPES)[number]>('running');
  const [currency, setCurrency] = useState(defaultCurrency);
  const close = () => {
    setName('');
    setType('running');
    onClose();
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="xs">
      <DialogTitle>{t('createAccount.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <TextField autoFocus fullWidth label={t('createAccount.nameLabel')} value={name} onChange={(event) => setName(event.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
          <TextField fullWidth select label={t('createAccount.typeLabel')} value={type} onChange={(event) => setType(event.target.value as (typeof ACCOUNT_TYPES)[number])}>
            {ACCOUNT_TYPES.map((candidate) => <MenuItem key={candidate} value={candidate}>{t(`createAccount.types.${candidate}`)}</MenuItem>)}
          </TextField>
          <TextField fullWidth label={t('createAccount.currencyLabel')} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} slotProps={{ htmlInput: { maxLength: 3 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={close} disabled={busy}>{t('imported.back')}</Button>
        <Button variant="contained" disabled={busy || !name.trim() || !/^[A-Za-z]{3}$/.test(currency)} onClick={() => onCreate({ name: name.trim(), type, currency })}>{t('createAccount.create')}</Button>
      </DialogActions>
    </Dialog>
  );
}
