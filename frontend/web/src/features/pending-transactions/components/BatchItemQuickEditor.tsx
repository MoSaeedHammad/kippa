import { useEffect, useMemo, useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Account, Category, PendingFinancialMessage } from '@kippa/domain';
import { CheckCircleIcon, DeleteIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { currencyLib } from '@/libs/currency';
import {
  useApprovePendingFinancialMessageMutation,
  useDiscardPendingFinancialMessageMutation,
} from '@/hooks/useFinance';

type QuickEditorDraft = {
  accountId: string;
  destinationAccountId: string;
  categoryId: string;
  merchant: string;
  convertedAmount: string;
};

type BatchItemQuickEditorProps = {
  item: PendingFinancialMessage;
  accounts: Account[];
  categories: Category[];
  merchantOptions: string[];
  /** Collapses the editor; the pending query refresh removes the settled row. */
  onDone: () => void;
};

/**
 * Inline editor for one staged batch message: account, category, merchant and
 * (for foreign-currency charges) the settled amount, with approve/discard
 * right in the list — the fast path for messages the bulk approve-all skips.
 * The full review dialog stays available for splits, tags and proposals.
 */
export function BatchItemQuickEditor({ item, accounts, categories, merchantOptions, onDone }: BatchItemQuickEditorProps) {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const approveMutation = useApprovePendingFinancialMessageMutation();
  const discardMutation = useDiscardPendingFinancialMessageMutation();
  const [draft, setDraft] = useState<QuickEditorDraft>(() => ({
    accountId: item.suggestedAccountId ?? '',
    destinationAccountId: item.suggestedDestinationAccountId ?? '',
    categoryId: item.suggestedCategoryId ?? '',
    merchant: item.counterparty ?? '',
    convertedAmount: '',
  }));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const busy = approveMutation.isPending || discardMutation.isPending;

  const transfer = item.kind === 'transfer';
  const conversionRequired = !!item.conversionRequired;
  const loanPayment = !!item.suggestedLoanId;

  const availableAccounts = useMemo(() => accounts.filter((account) => account.isActive
    && (conversionRequired ? account.id === item.suggestedAccountId : account.currency === item.currency)), [accounts, item, conversionRequired]);
  const availableDestinationAccounts = useMemo(() => {
    if (!transfer) return [];
    const targetCurrency = item.destinationCurrency ?? item.currency;
    return accounts.filter((account) => account.isActive && account.currency === targetCurrency && account.id !== draft.accountId);
  }, [accounts, transfer, item, draft.accountId]);
  const availableCategories = useMemo(() => {
    if (transfer || loanPayment) return [];
    const expectedType = item.kind === 'income' ? 'income' : 'expense';
    return categories.filter((category) => category.isActive && category.type === expectedType);
  }, [categories, item, transfer, loanPayment]);

  // Foreign-currency charges: prefill the settled amount from the live rate,
  // same as the full review dialog; the field stays editable.
  const ratePrefilled = useRef(false);
  useEffect(() => {
    if (!conversionRequired || ratePrefilled.current) return;
    ratePrefilled.current = true;
    const target = accounts.find((account) => account.id === (item.suggestedAccountId || draft.accountId))?.currency ?? item.currency;
    let cancelled = false;
    void currencyLib.getRate(item.currency, target).then((rate) => {
      if (!cancelled) setDraft((current) => ({ ...current, convertedAmount: (item.amount * rate).toFixed(2) }));
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canApprove = (!!draft.accountId || availableAccounts.length === 0)
    && (!transfer || !!draft.destinationAccountId)
    && (!conversionRequired || Number(draft.convertedAmount) > 0);

  const set = (patch: Partial<QuickEditorDraft>) => setDraft((current) => ({ ...current, ...patch }));

  const approve = async () => {
    try {
      await approveMutation.mutateAsync({
        householdId: item.householdId,
        pendingId: item.id,
        accountId: draft.accountId,
        destinationAccountId: transfer ? draft.destinationAccountId : undefined,
        categoryId: loanPayment || !draft.categoryId ? undefined : draft.categoryId,
        merchant: draft.merchant.trim() ? draft.merchant.trim() : undefined,
        convertedAmount: conversionRequired ? Number(draft.convertedAmount) : undefined,
      });
      enqueueSnackbar(t('toasts.approved'), { variant: 'success' });
      onDone();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.approveFailed'), { variant: 'error' });
    }
  };

  const discard = async () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    try {
      await discardMutation.mutateAsync({ householdId: item.householdId, pendingId: item.id });
      enqueueSnackbar(t('toasts.discarded'), { variant: 'info' });
      onDone();
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.discardFailed'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2, bgcolor: 'action.hover' }}>
      <Stack spacing={1.5}>
        {conversionRequired && (
          <TextField
            fullWidth
            size="small"
            label={t('reviewDialog.amountIn', { currency: accounts.find((account) => account.id === draft.accountId)?.currency ?? item.currency })}
            value={draft.convertedAmount}
            onChange={(event) => set({ convertedAmount: event.target.value })}
            disabled={busy}
            slotProps={{ htmlInput: { inputMode: 'decimal', type: 'number' } }}
          />
        )}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <FormControl fullWidth size="small">
            <InputLabel id={`quick-account-${item.id}`}>{item.kind === 'income' ? t('reviewDialog.toAccount') : t('reviewDialog.fromAccount')}</InputLabel>
            <Select
              labelId={`quick-account-${item.id}`}
              value={draft.accountId}
              label={item.kind === 'income' ? t('reviewDialog.toAccount') : t('reviewDialog.fromAccount')}
              onChange={(event) => set({ accountId: event.target.value })}
              disabled={busy}
            >
              {availableAccounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
            </Select>
          </FormControl>
          {transfer && (
            <FormControl fullWidth size="small">
              <InputLabel id={`quick-destination-${item.id}`}>{t('reviewDialog.toAccount')}</InputLabel>
              <Select
                labelId={`quick-destination-${item.id}`}
                value={draft.destinationAccountId}
                label={t('reviewDialog.toAccount')}
                onChange={(event) => set({ destinationAccountId: event.target.value })}
                disabled={busy}
              >
                {availableDestinationAccounts.map((account) => <MenuItem key={account.id} value={account.id}>{account.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          {!transfer && !loanPayment && (
            <FormControl fullWidth size="small">
              <InputLabel id={`quick-category-${item.id}`}>{t('reviewDialog.categoryOptional')}</InputLabel>
              <Select
                labelId={`quick-category-${item.id}`}
                value={draft.categoryId}
                label={t('reviewDialog.categoryOptional')}
                onChange={(event) => set({ categoryId: event.target.value })}
                disabled={busy}
              >
                <MenuItem value=""><em>{t('reviewDialog.noCategory')}</em></MenuItem>
                {availableCategories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <Autocomplete
            freeSolo
            fullWidth
            options={merchantOptions}
            value={draft.merchant}
            onInputChange={(_, value) => set({ merchant: value ?? '' })}
            renderInput={(params) => (
              <TextField {...params} size="small" label={t('reviewDialog.merchant')} />
            )}
            disabled={busy}
          />
        </Stack>
        <Stack direction="row" spacing={1.5} justifyContent="flex-end" alignItems="center">
          <Typography variant="fieldHint" sx={{ flex: 1 }}>
            <Money amount={item.amount} code={item.currency} />
          </Typography>
          <Button
            color="error"
            size="small"
            startIcon={discardMutation.isPending ? <CircularProgress color="inherit" size={16} /> : <DeleteIcon />}
            disabled={busy}
            onClick={() => void discard()}
          >
            {discardMutation.isPending ? t('reviewDialog.discarding') : confirmDiscard ? t('reviewDialog.discardPermanently') : t('reviewDialog.discard')}
          </Button>
          <Button
            variant="contained"
            color="success"
            size="small"
            startIcon={approveMutation.isPending ? <CircularProgress color="inherit" size={16} /> : <CheckCircleIcon />}
            disabled={!canApprove || busy}
            onClick={() => void approve()}
          >
            {approveMutation.isPending ? t('reviewDialog.approving') : t('reviewDialog.approve')}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
