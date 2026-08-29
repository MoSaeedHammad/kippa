import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { Account, Category, PendingFinancialMessage } from '@kippa/domain';
import { CheckCircleIcon, DeleteIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';

type Props = { accountId: string; accounts: Account[]; busy: boolean; categories: Category[]; categoryId: string; confirmDiscard: boolean; convertedAmount: string; destinationAccountId: string; destinationAccounts: Account[]; item: PendingFinancialMessage | null; onAccountChange: (id: string) => void; onApprove: () => void; onCategoryChange: (id: string) => void; onClose: () => void; onConvertedAmountChange: (value: string) => void; onDestinationChange: (id: string) => void; onDiscard: () => void; state: 'idle' | 'approving' | 'discarding' | 'settled' };

export function PendingReviewDialog(props: Props) {
  const { accountId, accounts, busy, categories, categoryId, confirmDiscard, convertedAmount, destinationAccountId, destinationAccounts, item, onAccountChange, onApprove, onCategoryChange, onClose, onConvertedAmountChange, onDestinationChange, onDiscard, state } = props;
  if (!item) return null;
  const transfer = item.kind === 'transfer';
  const crossCurrency = !!item.destinationCurrency && item.destinationCurrency !== item.currency;
  const halfPending = !!item.transferLeg;
  const loanPayment = !!item.suggestedLoanId;
  const conversionRequired = !!item.conversionRequired;
  const targetCurrency = accounts.find((account) => account.id === accountId)?.currency ?? item.currency;
  const canApprove = (transfer ? !halfPending && !!accountId && !!destinationAccountId : !!accountId && (loanPayment || !!categoryId))
    && (!conversionRequired || Number(convertedAmount) > 0);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {transfer ? 'Review transfer' : `Review detected ${item.kind}`}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>Nothing enters your ledger until you approve.</Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="amountValue">
              <Money amount={item.amount} code={item.currency} maxDigits={2} />
              {transfer && crossCurrency && <> → <Money amount={item.destinationAmount ?? 0} code={item.destinationCurrency ?? item.currency} maxDigits={2} /></>}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.description}</Typography>
            {loanPayment && <Chip color="success" label={`${item.suggestedLoanName ?? 'Loan'} · installment ${item.suggestedLoanInstallmentNumber}`} sx={{ mt: 1 }} />}
            {halfPending && <Typography variant="fieldHint" color="warning">Waiting for the other leg of this transfer…</Typography>}
          </Box>
          <Divider />
          <Stack spacing={2}>
            {!transfer && !loanPayment && <FormControl fullWidth><InputLabel id="pending-category-label">Category</InputLabel><Select labelId="pending-category-label" value={categoryId} label="Category" onChange={(event) => onCategoryChange(event.target.value)}>{categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}</Select></FormControl>}
            <FormControl fullWidth><InputLabel id="pending-account-label">{item.kind === 'income' ? 'To account' : 'From account'}</InputLabel><Select labelId="pending-account-label" value={accountId} label={item.kind === 'income' ? 'To account' : 'From account'} onChange={(event) => onAccountChange(event.target.value)}>{accounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}</Select></FormControl>
            {conversionRequired && (
              <TextField
                fullWidth
                label={`Amount in ${targetCurrency}`}
                value={convertedAmount}
                onChange={(event) => onConvertedAmountChange(event.target.value)}
                slotProps={{ htmlInput: { inputMode: 'decimal', type: 'number' } }}
                helperText={Number(convertedAmount) > 0 && item.amount > 0
                  ? `1 ${item.currency} ≈ ${(Number(convertedAmount) / item.amount).toFixed(3)} ${targetCurrency}`
                  : `Enter what the bank billed in ${targetCurrency}`}
              />
            )}
            {transfer && <FormControl fullWidth><InputLabel id="pending-destination-label">To account</InputLabel><Select labelId="pending-destination-label" value={destinationAccountId} label="To account" onChange={(event) => onDestinationChange(event.target.value)}>{destinationAccounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}</Select></FormControl>}
          </Stack>
          <Divider />
          <Box><Typography variant="sectionLabel" color="primary">Bank message</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.messagePreview}</Typography></Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" startIcon={state === 'discarding' ? <CircularProgress size={18} /> : <DeleteIcon />} onClick={onDiscard} disabled={busy}>{state === 'discarding' ? 'Discarding…' : confirmDiscard ? 'Discard permanently' : 'Discard'}</Button>
        <Button variant="contained" startIcon={state === 'approving' ? <CircularProgress color="inherit" size={18} /> : <CheckCircleIcon />} onClick={onApprove} disabled={!canApprove || busy}>{state === 'approving' ? 'Approving…' : 'Approve'}</Button>
      </DialogActions>
    </Dialog>
  );
}
