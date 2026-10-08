import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { Account, Category, RecurringTransactionRule } from '@kippa/domain';
import type { RecurringFrequency } from '@/libs/recurringTransactions';

export type RecurringRuleFormInput = {
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  accountId: string;
  categoryId: string | null;
  destinationAccountId: string | null;
  destinationAmount: number | null;
  merchant: string | null;
  description: string;
  frequency: RecurringFrequency;
  anchorDate: string;
  endDate: string | null;
};

const FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'yearly'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create / edit dialog for a recurring expense, income or transfer rule.
 * Mirrors the loan dialog: pick the flow type, the amount, the accounts,
 * how often it occurs and when it starts.
 */
export function RecurringRuleDialog({ open, rule, accounts, categories, busy, onClose, onSave }: {
  open: boolean;
  rule: RecurringTransactionRule | null;
  accounts: Account[];
  categories: Category[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: RecurringRuleFormInput) => Promise<void>;
}) {
  const { t } = useTranslation('recurring');
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(rule?.type ?? 'expense');
  const [amountText, setAmountText] = useState(rule ? String(rule.amount) : '');
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [destinationAccountId, setDestinationAccountId] = useState(rule?.destinationAccountId ?? '');
  const [destinationAmountText, setDestinationAmountText] = useState(rule?.destinationAmount ? String(rule.destinationAmount) : '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [merchant, setMerchant] = useState(rule?.merchant ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? 'monthly');
  const [anchorDate, setAnchorDate] = useState(rule?.anchorDate ?? todayIso());
  const [hasEnd, setHasEnd] = useState(Boolean(rule?.endDate));
  const [endDate, setEndDate] = useState(rule?.endDate ?? todayIso());

  const activeAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts]);
  const sourceAccount = activeAccounts.find((account) => account.id === accountId) ?? null;
  const destinationAccount = activeAccounts.find((account) => account.id === destinationAccountId) ?? null;
  const crossCurrency = Boolean(sourceAccount && destinationAccount && destinationAccount.currency !== sourceAccount.currency);
  const categoryOptions = useMemo(
    () => categories.filter((category) => category.isActive && (type === 'transfer' ? false : category.type === type)),
    [categories, type],
  );

  const amount = Number(amountText);
  const destinationAmount = Number(destinationAmountText);
  const canSave = Boolean(
    Number.isFinite(amount) && amount > 0
    && accountId
    && (type !== 'transfer' || (destinationAccountId && destinationAccountId !== accountId && (!crossCurrency || (Number.isFinite(destinationAmount) && destinationAmount > 0))))
    && (type === 'transfer' || categoryId)
    && anchorDate
    && (!hasEnd || endDate >= anchorDate),
  );

  const save = async () => {
    await onSave({
      type,
      amount,
      accountId,
      categoryId: type === 'transfer' ? null : categoryId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : null,
      destinationAmount: type === 'transfer' && crossCurrency ? destinationAmount : null,
      merchant: type === 'transfer' ? null : merchant.trim() || null,
      description: description.trim(),
      frequency,
      anchorDate,
      endDate: hasEnd ? endDate : null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {rule ? t('dialog.editTitle') : t('dialog.createTitle')}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('dialog.subtitle')}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1}>
            {(['expense', 'income', 'transfer'] as const).map((option) => (
              <Button
                key={option}
                onClick={() => setType(option)}
                variant={type === option ? 'segmentedSelected' : 'segmented'}
                sx={{ flex: 1 }}
              >
                {t(`types.${option}`)}
              </Button>
            ))}
          </Stack>

          <TextField
            autoFocus fullWidth type="number"
            label={t('fields.amount')}
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            error={!(Number.isFinite(amount) && amount > 0)}
          />

          <TextField
            select fullWidth
            label={type === 'transfer' ? t('fields.sourceAccount') : t('fields.account')}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
          >
            {activeAccounts.map((account) => (
              <MenuItem key={account.id} value={account.id}>
                {account.name} ({account.currency})
              </MenuItem>
            ))}
          </TextField>

          {type === 'transfer' && (
            <>
              <TextField
                select fullWidth
                label={t('fields.destinationAccount')}
                value={destinationAccountId}
                onChange={(event) => setDestinationAccountId(event.target.value)}
                error={Boolean(destinationAccountId && destinationAccountId === accountId)}
              >
                {activeAccounts.filter((account) => account.id !== accountId).map((account) => (
                  <MenuItem key={account.id} value={account.id}>
                    {account.name} ({account.currency})
                  </MenuItem>
                ))}
              </TextField>
              {crossCurrency && (
                <TextField
                  fullWidth type="number"
                  label={t('fields.destinationAmount', { currency: destinationAccount?.currency ?? '' })}
                  value={destinationAmountText}
                  onChange={(event) => setDestinationAmountText(event.target.value)}
                  error={!(Number.isFinite(destinationAmount) && destinationAmount > 0)}
                  helperText={t('fields.destinationAmountHint', {
                    source: sourceAccount?.currency ?? '',
                    destination: destinationAccount?.currency ?? '',
                  })}
                />
              )}
            </>
          )}

          {type !== 'transfer' && (
            <>
              <TextField
                select fullWidth
                label={t('fields.category')}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {categoryOptions.map((category) => (
                  <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                label={t('fields.merchant')}
                placeholder={t('fields.merchantPlaceholder')}
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
              />
            </>
          )}

          <TextField
            fullWidth
            label={t('fields.description')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <TextField
            select fullWidth
            label={t('fields.occurs')}
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
          >
            {FREQUENCIES.map((option) => (
              <MenuItem key={option} value={option}>{t(`frequencies.${option}`)}</MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth type="date"
              label={t('fields.startDate')}
              value={anchorDate}
              onChange={(event) => setAnchorDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              fullWidth type="date"
              label={t('fields.endDate')}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              disabled={!hasEnd}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <FormControlLabel
            control={<Switch checked={hasEnd} onChange={(event) => setHasEnd(event.target.checked)} />}
            label={t('fields.hasEnd')}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dialog.cancel')}</Button>
        <Button variant="contained" disabled={!canSave} loading={busy} onClick={() => void save()}>
          {rule ? t('dialog.save') : t('dialog.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
