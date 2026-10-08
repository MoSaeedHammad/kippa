import { useState } from 'react';
import { Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from '@mui/material';
import type { FinanceTransaction } from '@kippa/domain';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { SwapHorizIcon, SyncAltIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts } from '@/hooks/useFinance';
import { useDecideRecurringDraftMutation, useRecurringDrafts } from '@/features/transactions/hooks/useRecurringTransactions';

/**
 * Recurring confirmations section of the unified Approvals page: each due
 * occurrence of a recurring income/expense/transfer rule waits here until a
 * member confirms (posts, with an optional amount adjustment) or skips (voids)
 * it.
 */
export function RecurringConfirmationsCard() {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const { data: drafts = [] } = useRecurringDrafts(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const decideMutation = useDecideRecurringDraftMutation();
  const [confirming, setConfirming] = useState<FinanceTransaction | null>(null);

  if (drafts.length === 0) return null;
  const accountName = (id?: string | null) => (id ? accounts.find((account) => account.id === id)?.name : undefined);

  const confirm = async (transactionId: string, amount?: number) => {
    try {
      await decideMutation.mutateAsync({ householdId, transactionId, action: 'confirm', amount });
      enqueueSnackbar(t('recurring.toasts.confirmed'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('recurring.toasts.failed'), { variant: 'error' });
    }
  };

  const skip = async (transactionId: string) => {
    try {
      await decideMutation.mutateAsync({ householdId, transactionId, action: 'skip' });
      enqueueSnackbar(t('recurring.toasts.skipped'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('recurring.toasts.failed'), { variant: 'error' });
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Typography variant="cardTitle">{t('recurring.title')}</Typography>
        <Typography variant="cardSubtitle" color="text.secondary">{t('recurring.subtitle')}</Typography>
      </Box>
      <Divider />
      {drafts.map((draft: FinanceTransaction, index) => {
        const draftData = draft.recurringDraft!;
        const isTransfer = draft.type === 'transfer' && draftData.destinationAccountId;
        const busy = decideMutation.isPending && decideMutation.variables?.transactionId === draft.id;
        return (
          <Box key={draft.id}>
            <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {isTransfer
                ? <SwapHorizIcon color="info" />
                : <SyncAltIcon color={draft.type === 'income' ? 'success' : 'primary'} />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip
                    label={isTransfer ? t('recurring.transfer') : draft.type === 'income' ? t('recurring.income') : t('recurring.expense')}
                    size="small" variant="outlined"
                  />
                  <Typography noWrap variant="sectionLabel" sx={{ flex: 1 }}>{draft.description}</Typography>
                </Box>
                <Typography noWrap variant="fieldHint" color="text.secondary">
                  {[
                    draft.date,
                    isTransfer
                      ? [accountName(draftData.accountId), accountName(draftData.destinationAccountId)].filter(Boolean).join(' → ')
                      : accountName(draftData.accountId),
                    draftData.merchant ?? undefined,
                  ].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Typography variant="sectionLabel" color={!isTransfer && draft.type === 'income' ? 'success.main' : 'text.primary'} sx={{ whiteSpace: 'nowrap' }}>
                {isTransfer
                  ? <><Money amount={draftData.amount} code={draftData.currency} />{draftData.destinationAmount != null && draftData.destinationCurrency ? <> → <Money amount={draftData.destinationAmount} code={draftData.destinationCurrency} /></> : null}</>
                  : <>{draft.type === 'income' ? '+' : '−'}<Money amount={draftData.amount} code={draftData.currency} /></>}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Button
                  size="small" variant="contained" color="success"
                  disabled={busy}
                  onClick={() => setConfirming(draft)}
                >
                  {isTransfer
                    ? t('recurring.actions.confirmTransfer')
                    : draft.type === 'expense' ? t('recurring.actions.confirmPaid') : t('recurring.actions.confirmReceived')}
                </Button>
                <Button
                  size="small" variant="outlined" color="error"
                  disabled={busy}
                  onClick={() => skip(draft.id)}
                >
                  {t('recurring.actions.skip')}
                </Button>
              </Box>
            </Box>
            {index < drafts.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
          </Box>
        );
      })}
      <ConfirmRecurringDialog
        key={confirming?.id ?? 'none'}
        draft={confirming}
        accountName={(id) => accountName(id)}
        busy={decideMutation.isPending && decideMutation.variables?.transactionId === confirming?.id}
        onClose={() => setConfirming(null)}
        onConfirm={async (amount) => {
          if (!confirming) return;
          await confirm(confirming.id, amount);
          setConfirming(null);
        }}
      />
    </Card>
  );
}

/** Confirms a due occurrence; the amount can be adjusted before posting. */
function ConfirmRecurringDialog({ draft, accountName, busy, onClose, onConfirm }: {
  draft: FinanceTransaction | null;
  accountName: (accountId?: string | null) => string | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: (amount?: number) => Promise<void>;
}) {
  const { t } = useTranslation('pendingTransactions');
  const [amountText, setAmountText] = useState<string | null>(null);
  const draftData = draft?.recurringDraft ?? null;
  const isTransfer = draft?.type === 'transfer' && !!draftData?.destinationAccountId;
  const amount = amountText ?? (draftData ? String(draftData.amount) : '0');
  const parsedAmount = Number(amount);
  const valid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <Dialog open={Boolean(draft)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t('recurring.confirmDialog.title')}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {draft?.description}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {draftData && (
            <Box>
              <Typography variant="fieldHint" color="text.secondary">{t('recurring.confirmDialog.scheduled')}</Typography>
              <Typography variant="sectionLabel">
                {isTransfer
                  ? <>{accountName(draftData.accountId)} → {accountName(draftData.destinationAccountId)}</>
                  : accountName(draftData.accountId)}
                {' · '}
                {draft?.date}
              </Typography>
            </Box>
          )}
          <TextField
            autoFocus
            fullWidth
            type="number"
            label={isTransfer ? t('recurring.confirmDialog.sourceAmount') : t('recurring.confirmDialog.amount')}
            helperText={isTransfer ? t('recurring.confirmDialog.transferHint') : t('recurring.confirmDialog.amountHint')}
            value={amount}
            onChange={(event) => setAmountText(event.target.value)}
            error={!valid}
            disabled={isTransfer}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('recurring.confirmDialog.cancel')}</Button>
        <Button
          variant="contained" color="success" disabled={!valid} loading={busy}
          onClick={() => onConfirm(parsedAmount)}
        >
          {t('recurring.confirmDialog.confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
