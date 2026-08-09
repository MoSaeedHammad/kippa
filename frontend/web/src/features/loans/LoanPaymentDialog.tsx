import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import type { Loan } from '@kippa/domain';

export function LoanPaymentDialog({ loan, open, busy, onClose, onSave }: { loan: Loan | null; open: boolean; busy: boolean; onClose: () => void; onSave: (amount: number, date: string) => Promise<void> }) {
  const [amount, setAmount] = useState(() => loan?.installmentAmount ?? 0); const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs"><DialogTitle>Record loan payment<Typography component="span" variant="fieldHint" color="text.secondary" display="block">This creates the expense and advances the loan together.</Typography></DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ mt: 1 }}><TextField autoFocus fullWidth type="number" label="Amount" value={amount} onChange={e => setAmount(Number(e.target.value))} /><TextField fullWidth type="date" label="Withdrawal date" value={date} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!loan || amount <= 0 || !date} loading={busy} onClick={() => onSave(amount, date)}>Record payment</Button></DialogActions></Dialog>;
}
