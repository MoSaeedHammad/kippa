import { useState } from 'react';
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
      <DialogTitle>Create Statement</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label="Cycle Name"
            placeholder="e.g. July 2026"
            value={values.name}
            onChange={(event) => update('name', event.target.value)}
            error={nameError}
            helperText={nameError ? 'A cycle name is required.' : undefined}
          />
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField fullWidth type="date" label="Start Date" value={values.startDate} onChange={(event) => update('startDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
            <Grid size={6}>
              <TextField fullWidth type="date" label="Target End Date" value={values.endDate} onChange={(event) => update('endDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>
          </Grid>
          <FormControlLabel
            control={<Checkbox checked={values.status === 'open'} onChange={(event) => update('status', event.target.checked ? 'open' : 'planned')} />}
            label="Set as active immediately (will close current active cycle)"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} variant="contained" loading={busy}>Create</Button>
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

const CONFIRMATIONS = [
  'I have reconciled and verified all bank balances for this month.',
  'All USD transactions and exchanges have been logged.',
  'I understand this locks the cycle and moves leftovers forward.',
] as const;

export function CloseCycleDialog({ busy, onClose, onConfirm, open }: CloseCycleDialogProps) {
  const [confirmed, setConfirmed] = useState(() => CONFIRMATIONS.map(() => false));
  const canConfirm = confirmed.every(Boolean);

  const handleConfirm = async () => {
    if (canConfirm && await onConfirm()) setConfirmed(CONFIRMATIONS.map(() => false));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle color="error">Close Statement</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Closing the active cycle compiles balances, carries forward leftovers and locks edits. Confirm items below:
        </Typography>
        <Stack spacing={2.5}>
          {CONFIRMATIONS.map((label, index) => (
            <FormControlLabel
              key={label}
              control={<Checkbox checked={confirmed[index]} onChange={(event) => setConfirmed((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value))} />}
              label={label}
            />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleConfirm} disabled={!canConfirm} loading={busy} variant="contained" color="error">Confirm &amp; Close</Button>
      </DialogActions>
    </Dialog>
  );
}
