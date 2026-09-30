import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import type { Loan } from '@kippa/domain';

export function LoanPaymentDialog({ loan, open, busy, onClose, onSave }: { loan: Loan | null; open: boolean; busy: boolean; onClose: () => void; onSave: (amount: number, date: string) => Promise<void> }) {
  const { t } = useTranslation('loans');
  const [amount, setAmount] = useState(() => loan?.installmentAmount ?? 0); const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  return <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs"><DialogTitle>{t('paymentDialog.title')}<Typography component="span" variant="fieldHint" color="text.secondary" display="block">{t('paymentDialog.subtitle')}</Typography></DialogTitle><DialogContent dividers><Stack spacing={2} sx={{ mt: 1 }}><TextField autoFocus fullWidth type="number" label={t('paymentDialog.amount')} value={amount} onChange={e => setAmount(Number(e.target.value))} /><TextField fullWidth type="date" label={t('paymentDialog.date')} value={date} onChange={e => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Stack></DialogContent><DialogActions><Button onClick={onClose}>{t('paymentDialog.cancel')}</Button><Button variant="contained" disabled={!loan || amount <= 0 || !date} loading={busy} onClick={() => onSave(amount, date)}>{t('paymentDialog.record')}</Button></DialogActions></Dialog>;
}
