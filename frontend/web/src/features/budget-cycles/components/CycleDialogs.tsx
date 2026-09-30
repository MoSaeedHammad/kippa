import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type budgetCyclesEn from '@/i18n/locales/en/budgetCycles.json';

export type NewCycleValues = {
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'planned';
};

type CreateCycleDialogProps = {
  busy: boolean;
  onClose: () => void;
  onCreate: (values: NewCycleValues) => Promise<boolean>;
  open: boolean;
};

const today = () => new Date().toISOString().split('T')[0];

export function CreateCycleDialog({ busy, onClose, onCreate, open }: CreateCycleDialogProps) {
  const { t } = useTranslation('budgetCycles');
  const [values, setValues] = useState<NewCycleValues>({ name: '', startDate: today(), endDate: '', status: 'open' });
  const [nameError, setNameError] = useState(false);

  const update = <Key extends keyof NewCycleValues>(key: Key, value: NewCycleValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === 'name') setNameError(false);
  };

  const handleCreate = async () => {
    if (!values.name.trim()) {
      setNameError(true);
      return;
    }
    if (await onCreate({ ...values, name: values.name.trim() })) {
      setValues({ name: '', startDate: today(), endDate: '', status: 'open' });
      setNameError(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('createDialog.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label={t('createDialog.nameLabel')}
            placeholder={t('createDialog.namePlaceholder')}
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            error={nameError}
            helperText={nameError ? t('createDialog.nameRequired') : undefined}
          />
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField fullWidth type="date" label={t('createDialog.startDate')} value={values.startDate} onChange={(event) => update('startDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth type="date" label={t('createDialog.endDate')} value={values.endDate} onChange={(event) => update('endDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
          </Grid>
          <FormControlLabel
            control={<Checkbox checked={values.status === 'open'} onChange={(event) => update('status', event.target.checked ? 'open' : 'planned')} />}
            label={t('createDialog.setActiveNow')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('createDialog.cancel')}</Button>
        <Button onClick={handleCreate} variant="contained" loading={busy}>{t('createDialog.create')}</Button>
      </DialogActions>
    </Dialog>
  );
}

type CloseCycleDialogProps = {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  open: boolean;
};

type ConfirmationKey = keyof typeof budgetCyclesEn['closeDialog']['confirmations'];

const CONFIRMATION_KEYS: ConfirmationKey[] = ['bankBalances', 'usdLogged', 'locks'];

export function CloseCycleDialog({ busy, onClose, onConfirm, open }: CloseCycleDialogProps) {
  const { t } = useTranslation('budgetCycles');
  const [confirmed, setConfirmed] = useState(() => CONFIRMATION_KEYS.map(() => false));
  const canConfirm = confirmed.every(Boolean);

  const handleConfirm = async () => {
    if (canConfirm && await onConfirm()) setConfirmed(CONFIRMATION_KEYS.map(() => false));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle color="error">{t('closeDialog.title')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t('closeDialog.intro')}
        </Typography>
        <Stack spacing={2.5}>
          {CONFIRMATION_KEYS.map((key, index) => (
            <FormControlLabel
              key={key}
              control={<Checkbox checked={confirmed[index]} onChange={(event) => setConfirmed((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} />}
              label={t(`closeDialog.confirmations.${key}`)}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('closeDialog.cancel')}</Button>
        <Button onClick={handleConfirm} disabled={!canConfirm} loading={busy} variant="contained" color="error">{t('closeDialog.confirm')}</Button>
      </DialogActions>
    </Dialog>
  );
}
