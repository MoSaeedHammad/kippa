import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import type { Household } from '@kippa/domain';

export function LeaveHouseholdDialog({ busy, household, onClose, onConfirm }: { busy: boolean; household: Household | null; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={!!household} onClose={onClose} aria-labelledby="leave-dialog-title" aria-describedby="leave-dialog-description">
      <DialogTitle id="leave-dialog-title">Leave shared account?</DialogTitle>
      <DialogContent>
        <DialogContentText id="leave-dialog-description">
          Are you sure you want to leave the shared account <strong>{household?.name}</strong>? You will no longer be able to access its transactions and ledger details. You can only rejoin if the owner approves a new request.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={busy} autoFocus>Leave Household</Button>
      </DialogActions>
    </Dialog>
  );
}
