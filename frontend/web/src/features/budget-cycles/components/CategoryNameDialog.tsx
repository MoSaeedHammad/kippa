import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface CategoryNameDialogProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  value: string;
  placeholder?: string;
  loading: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function CategoryNameDialog({
  open,
  title,
  confirmLabel,
  value,
  placeholder,
  loading,
  onChange,
  onClose,
  onConfirm,
}: CategoryNameDialogProps) {
  const { t } = useTranslation('budgetCycles');
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ minWidth: 300 }}>
        <TextField
          autoFocus
          fullWidth
          label={t('allocations.nameLabel')}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{t('allocations.cancel')}</Button>
        <Button onClick={onConfirm} variant="contained" disabled={!value.trim()} loading={loading}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
