import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Household } from '@kippa/domain';

export function LeaveHouseholdDialog({ busy, household, onClose, onConfirm }: { busy: boolean; household: Household | null; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation('household');
  return (
    <Dialog open={!!household} onClose={onClose} aria-labelledby="leave-dialog-title" aria-describedby="leave-dialog-description">
      <DialogTitle id="leave-dialog-title">{t('leaveDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText id="leave-dialog-description">
          {t('leaveDialog.descriptionPrefix')} <strong>{household?.name}</strong>{t('leaveDialog.descriptionSuffix')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">{t('leaveDialog.cancel')}</Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={busy} autoFocus>{t('leaveDialog.confirm')}</Button>
      </DialogActions>
    </Dialog>
  );
}
