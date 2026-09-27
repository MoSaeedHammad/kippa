import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { Account, Category, HouseholdMember, PendingFinancialMessage } from '@kippa/domain';
import { CheckCircleIcon, DeleteIcon, SwapHorizIcon } from '@/components/AppIcon';
import type { SharedBalanceTagDraft } from '../hooks/usePendingReviewState';
import { Money } from '@/components/Money';

type Props = { accountId: string; accounts: Account[]; busy: boolean; categories: Category[]; categoryId: string; confirmDiscard: boolean; convertedAmount: string; destinationAccountId: string; destinationAccounts: Account[]; item: PendingFinancialMessage | null; onAccountChange: (id: string) => void; onApprove: () => void; onCategoryChange: (id: string) => void; onClose: () => void; onConvertedAmountChange: (value: string) => void; onDestinationChange: (id: string) => void; onDiscard: () => void; state: 'idle' | 'approving' | 'discarding' | 'settled'; members?: HouseholdMember[]; sharedBalanceTag?: SharedBalanceTagDraft; onSharedBalanceTagChange?: (tag: SharedBalanceTagDraft) => void };

export function PendingReviewDialog(props: Props) {
  const { accountId, accounts, busy, categories, categoryId, confirmDiscard, convertedAmount, destinationAccountId, destinationAccounts, item, onAccountChange, onApprove, onCategoryChange, onClose, onConvertedAmountChange, onDestinationChange, onDiscard, state, members = [], sharedBalanceTag, onSharedBalanceTagChange } = props;
  if (!item) return null;
  const transfer = item.kind === 'transfer';
  const crossCurrency = !!item.destinationCurrency && item.destinationCurrency !== item.currency;
  const halfPending = !!item.transferLeg;
  const loanPayment = !!item.suggestedLoanId;
  const conversionRequired = !!item.conversionRequired;
  const targetCurrency = accounts.find((account) => account.id === accountId)?.currency ?? item.currency;
  const tag = sharedBalanceTag ?? { kind: 'none' as const, counterpartyUid: '', share: '' };
  const tagEnabled = tag.kind !== 'none';
  const tagShareValid = tag.kind !== 'split' || (Number(tag.share) > 0 && Number(tag.share) <= item.amount);
  const canApprove = (transfer ? !halfPending && !!accountId && !!destinationAccountId : !!accountId && (loanPayment || !!categoryId))
    && (!conversionRequired || Number(convertedAmount) > 0)
    && (!tagEnabled || (!!tag.counterpartyUid && tagShareValid));
  const otherMembers = members.filter((member) => member.uid !== item.receivedBy);
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
          {onSharedBalanceTagChange && otherMembers.length > 0 && (
            <>
              <Divider />
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <SwapHorizIcon sx={{ color: 'primary.main' }} />
                  <Typography variant="sectionLabel" color="primary">Shared balance (optional)</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Tag this message as an IOU or split — the other member approves it before it counts.
                </Typography>
                <FormControl fullWidth>
                  <InputLabel id="pending-tag-kind-label">Shared balance tag</InputLabel>
                  <Select
                    labelId="pending-tag-kind-label"
                    value={tag.kind}
                    label="Shared balance tag"
                    onChange={(event) => onSharedBalanceTagChange({ ...tag, kind: event.target.value as SharedBalanceTagDraft['kind'], counterpartyUid: '', share: '' })}
                  >
                    <MenuItem value="none">No tag</MenuItem>
                    <MenuItem value="iou">IOU — full amount for them</MenuItem>
                    <MenuItem value="split">Split — a share of it is theirs</MenuItem>
                  </Select>
                </FormControl>
                {tagEnabled && (
                  <FormControl fullWidth>
                    <InputLabel id="pending-tag-member-label">Member</InputLabel>
                    <Select
                      labelId="pending-tag-member-label"
                      value={tag.counterpartyUid}
                      label="Member"
                      onChange={(event) => onSharedBalanceTagChange({ ...tag, counterpartyUid: event.target.value })}
                    >
                      {otherMembers.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {tag.kind === 'split' && (
                  <TextField
                    fullWidth
                    label={`Their share (max ${item.amount})`}
                    value={tag.share}
                    onChange={(event) => onSharedBalanceTagChange({ ...tag, share: event.target.value })}
                    slotProps={{ htmlInput: { inputMode: 'decimal', type: 'number' } }}
                    error={!!tag.share && !tagShareValid}
                    helperText={`The entry stores only their share — your full ${item.amount} ${item.currency} stays private.`}
                  />
                )}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" startIcon={state === 'discarding' ? <CircularProgress size={18} /> : <DeleteIcon />} onClick={onDiscard} disabled={busy}>{state === 'discarding' ? 'Discarding…' : confirmDiscard ? 'Discard permanently' : 'Discard'}</Button>
        <Button variant="contained" startIcon={state === 'approving' ? <CircularProgress color="inherit" size={18} /> : <CheckCircleIcon />} onClick={onApprove} disabled={!canApprove || busy}>{state === 'approving' ? 'Approving…' : 'Approve'}</Button>
      </DialogActions>
    </Dialog>
  );
}
