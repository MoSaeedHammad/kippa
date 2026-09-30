import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { Account, Category, HouseholdMember, PendingFinancialMessage } from '@kippa/domain';
import { CheckCircleIcon, DeleteIcon, SwapHorizIcon } from '@/components/AppIcon';
import type { SharedBalanceTagDraft } from '../hooks/usePendingReviewState';
import { Money } from '@/components/Money';

type Props = { accountId: string; accounts: Account[]; busy: boolean; categories: Category[]; categoryId: string; confirmDiscard: boolean; convertedAmount: string; destinationAccountId: string; destinationAccounts: Account[]; item: PendingFinancialMessage | null; onAccountChange: (id: string) => void; onApprove: () => void; onCategoryChange: (id: string) => void; onClose: () => void; onConvertedAmountChange: (value: string) => void; onDestinationChange: (id: string) => void; onDiscard: () => void; state: 'idle' | 'approving' | 'discarding' | 'settled'; members?: HouseholdMember[]; sharedBalanceTag?: SharedBalanceTagDraft; onSharedBalanceTagChange?: (tag: SharedBalanceTagDraft) => void };

export function PendingReviewDialog(props: Props) {
  const { t } = useTranslation('pendingTransactions');
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
        {transfer ? t('reviewDialog.transferTitle') : t('reviewDialog.detectedTitle', { kind: item.kind })}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>{t('reviewDialog.subtitle')}</Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="amountValue">
              <Money amount={item.amount} code={item.currency} maxDigits={2} />
              {transfer && crossCurrency && <> → <Money amount={item.destinationAmount ?? 0} code={item.destinationCurrency ?? item.currency} maxDigits={2} /></>}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.description}</Typography>
            {loanPayment && <Chip color="success" label={t('reviewDialog.loanInstallment', { name: item.suggestedLoanName ?? t('reviewDialog.loanFallback'), installment: item.suggestedLoanInstallmentNumber })} sx={{ mt: 1 }} />}
            {halfPending && <Typography variant="fieldHint" color="warning">{t('reviewDialog.waitingOtherLeg')}</Typography>}
          </Box>
          <Divider />
          <Stack spacing={2}>
            {!transfer && !loanPayment && <FormControl fullWidth><InputLabel id="pending-category-label">{t('reviewDialog.category')}</InputLabel><Select labelId="pending-category-label" value={categoryId} label={t('reviewDialog.category')} onChange={(event) => onCategoryChange(event.target.value)}>{categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}</Select></FormControl>}
            <FormControl fullWidth><InputLabel id="pending-account-label">{item.kind === 'income' ? t('reviewDialog.toAccount') : t('reviewDialog.fromAccount')}</InputLabel><Select labelId="pending-account-label" value={accountId} label={item.kind === 'income' ? t('reviewDialog.toAccount') : t('reviewDialog.fromAccount')} onChange={(event) => onAccountChange(event.target.value)}>{accounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}</Select></FormControl>
            {conversionRequired && (
              <TextField
                fullWidth
                label={t('reviewDialog.amountIn', { currency: targetCurrency })}
                value={convertedAmount}
                onChange={(event) => onConvertedAmountChange(event.target.value)}
                slotProps={{ htmlInput: { inputMode: 'decimal', type: 'number' } }}
                helperText={Number(convertedAmount) > 0 && item.amount > 0
                  ? t('reviewDialog.rateApprox', { currency: item.currency, rate: (Number(convertedAmount) / item.amount).toFixed(3), target: targetCurrency })
                  : t('reviewDialog.enterBilled', { currency: targetCurrency })}
              />
            )}
            {transfer && <FormControl fullWidth><InputLabel id="pending-destination-label">{t('reviewDialog.toAccount')}</InputLabel><Select labelId="pending-destination-label" value={destinationAccountId} label={t('reviewDialog.toAccount')} onChange={(event) => onDestinationChange(event.target.value)}>{destinationAccounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}</Select></FormControl>}
          </Stack>
          <Divider />
          <Box><Typography variant="sectionLabel" color="primary">{t('reviewDialog.bankMessage')}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.messagePreview}</Typography></Box>
          {onSharedBalanceTagChange && otherMembers.length > 0 && (
            <>
              <Divider />
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <SwapHorizIcon sx={{ color: 'primary.main' }} />
                  <Typography variant="sectionLabel" color="primary">{t('reviewDialog.sharedBalanceTitle')}</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {t('reviewDialog.sharedBalanceHelp')}
                </Typography>
                <FormControl fullWidth>
                  <InputLabel id="pending-tag-kind-label">{t('reviewDialog.sharedBalanceTag')}</InputLabel>
                  <Select
                    labelId="pending-tag-kind-label"
                    value={tag.kind}
                    label={t('reviewDialog.sharedBalanceTag')}
                    onChange={(event) => onSharedBalanceTagChange({ ...tag, kind: event.target.value as SharedBalanceTagDraft['kind'], counterpartyUid: '', share: '' })}
                  >
                    <MenuItem value="none">{t('reviewDialog.noTag')}</MenuItem>
                    <MenuItem value="iou">{t('reviewDialog.tagIou')}</MenuItem>
                    <MenuItem value="split">{t('reviewDialog.tagSplit')}</MenuItem>
                  </Select>
                </FormControl>
                {tagEnabled && (
                  <FormControl fullWidth>
                    <InputLabel id="pending-tag-member-label">{t('reviewDialog.member')}</InputLabel>
                    <Select
                      labelId="pending-tag-member-label"
                      value={tag.counterpartyUid}
                      label={t('reviewDialog.member')}
                      onChange={(event) => onSharedBalanceTagChange({ ...tag, counterpartyUid: event.target.value })}
                    >
                      {otherMembers.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {tag.kind === 'split' && (
                  <TextField
                    fullWidth
                    label={t('reviewDialog.theirShare', { max: item.amount })}
                    value={tag.share}
                    onChange={(event) => onSharedBalanceTagChange({ ...tag, share: event.target.value })}
                    slotProps={{ htmlInput: { inputMode: 'decimal', type: 'number' } }}
                    error={!!tag.share && !tagShareValid}
                    helperText={t('reviewDialog.sharePrivate', { amount: item.amount, currency: item.currency })}
                  />
                )}
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" startIcon={state === 'discarding' ? <CircularProgress size={18} /> : <DeleteIcon />} onClick={onDiscard} disabled={busy}>{state === 'discarding' ? t('reviewDialog.discarding') : confirmDiscard ? t('reviewDialog.discardPermanently') : t('reviewDialog.discard')}</Button>
        <Button variant="contained" startIcon={state === 'approving' ? <CircularProgress color="inherit" size={18} /> : <CheckCircleIcon />} onClick={onApprove} disabled={!canApprove || busy}>{state === 'approving' ? t('reviewDialog.approving') : t('reviewDialog.approve')}</Button>
      </DialogActions>
    </Dialog>
  );
}
