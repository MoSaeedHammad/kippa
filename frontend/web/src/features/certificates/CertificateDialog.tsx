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
} from '@mui/material';
import type { Account, Category, Certificate } from '@kippa/domain';
import { BANK_LIST } from '@/features/cards/banks/banks';
import type { CertificateInput } from '@/libs/certificates';

const FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const;
const PERIODS_PER_YEAR: Record<(typeof FREQUENCIES)[number], number> = { weekly: 52, monthly: 12, yearly: 1 };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Interest per payout derived from the rate — a suggestion, editable. */
export function suggestedPayout(principal: number, annualRatePct: number, frequency: (typeof FREQUENCIES)[number]): number {
  return Math.round(((principal * annualRatePct) / 100 / PERIODS_PER_YEAR[frequency]) * 100) / 100;
}

/**
 * Create / edit dialog for a deposit certificate. The interest payout is
 * materialized by a linked recurring income rule the backend creates, so the
 * payout amount, cadence and start date here drive that rule.
 */
export function CertificateDialog({ open, certificate, accounts, categories, busy, onClose, onSave }: {
  open: boolean;
  certificate: Certificate | null;
  accounts: Account[];
  categories: Category[];
  busy: boolean;
  onClose: () => void;
  onSave: (input: CertificateInput) => Promise<void>;
}) {
  const { t } = useTranslation('certificates');
  const [name, setName] = useState(certificate?.name ?? '');
  const [bankId, setBankId] = useState(certificate?.bankId ?? '');
  const [accountId, setAccountId] = useState(certificate?.accountId ?? '');
  const [principalText, setPrincipalText] = useState(certificate ? String(certificate.principal) : '');
  const [rateText, setRateText] = useState(certificate ? String(certificate.annualRatePct) : '');
  const [frequency, setFrequency] = useState<(typeof FREQUENCIES)[number]>(certificate?.payoutFrequency ?? 'monthly');
  const [payoutText, setPayoutText] = useState(certificate ? String(certificate.payoutAmount) : '');
  const [payoutTouched, setPayoutTouched] = useState(Boolean(certificate));
  const [startDate, setStartDate] = useState(certificate?.startDate ?? todayIso());
  const [hasMaturity, setHasMaturity] = useState(Boolean(certificate?.maturityDate));
  const [maturityDate, setMaturityDate] = useState(certificate?.maturityDate ?? todayIso());
  const [categoryId, setCategoryId] = useState(certificate?.categoryId ?? '');
  const [notes, setNotes] = useState(certificate?.notes ?? '');

  const activeAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts]);
  const incomeCategories = useMemo(() => categories.filter((category) => category.isActive && category.type === 'income'), [categories]);

  const principal = Number(principalText);
  const rate = Number(rateText);

  // Keep the payout suggestion in step until the user edits it by hand.
  const autoPayout = Number.isFinite(principal) && principal > 0 && Number.isFinite(rate) && rate >= 0
    ? suggestedPayout(principal, rate, frequency)
    : null;
  const effectivePayoutText = payoutTouched ? payoutText : autoPayout != null ? String(autoPayout) : payoutText;
  const effectivePayout = Number(effectivePayoutText);

  const account = activeAccounts.find((candidate) => candidate.id === accountId) ?? null;
  const canSave = Boolean(
    name.trim()
    && accountId
    && Number.isFinite(principal) && principal > 0
    && Number.isFinite(rate) && rate >= 0
    && Number.isFinite(effectivePayout) && effectivePayout > 0
    && startDate
    && (!hasMaturity || maturityDate >= startDate),
  );

  const save = async () => {
    await onSave({
      name: name.trim(),
      bankId: bankId || null,
      accountId,
      principal,
      annualRatePct: rate,
      payoutFrequency: frequency,
      payoutAmount: effectivePayout,
      startDate,
      maturityDate: hasMaturity ? maturityDate : null,
      categoryId: categoryId || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {certificate ? t('dialog.editTitle') : t('dialog.createTitle')}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            autoFocus fullWidth
            label={t('fields.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={!name.trim()}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select fullWidth
              label={t('fields.bank')}
              value={bankId}
              onChange={(event) => setBankId(event.target.value)}
            >
              <MenuItem value="">{t('fields.noBank')}</MenuItem>
              {BANK_LIST.map((bank) => (
                <MenuItem key={bank.id} value={bank.id}>{bank.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select fullWidth
              label={t('fields.payoutAccount')}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              error={!accountId}
              helperText={account ? account.currency : undefined}
            >
              {activeAccounts.map((candidate) => (
                <MenuItem key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.currency})
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth type="number"
              label={t('fields.principal')}
              value={principalText}
              onChange={(event) => setPrincipalText(event.target.value)}
              error={!(Number.isFinite(principal) && principal > 0)}
            />
            <TextField
              fullWidth type="number"
              label={t('fields.rate')}
              value={rateText}
              onChange={(event) => setRateText(event.target.value)}
              error={!(Number.isFinite(rate) && rate >= 0)}
              slotProps={{ input: { endAdornment: '%' } }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              select fullWidth
              label={t('fields.frequency')}
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as (typeof FREQUENCIES)[number])}
            >
              {FREQUENCIES.map((option) => (
                <MenuItem key={option} value={option}>{t(`frequencies.${option}`)}</MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth type="number"
              label={t('fields.payoutAmount')}
              value={effectivePayoutText}
              onChange={(event) => { setPayoutTouched(true); setPayoutText(event.target.value); }}
              error={!(Number.isFinite(effectivePayout) && effectivePayout > 0)}
              helperText={autoPayout != null ? t('fields.payoutHint', { amount: autoPayout }) : undefined}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              fullWidth type="date"
              label={t('fields.startDate')}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              fullWidth type="date"
              label={t('fields.maturityDate')}
              value={maturityDate}
              onChange={(event) => setMaturityDate(event.target.value)}
              disabled={!hasMaturity}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
          <FormControlLabel
            control={<Switch checked={hasMaturity} onChange={(event) => setHasMaturity(event.target.checked)} />}
            label={t('fields.hasMaturity')}
          />
          <TextField
            select fullWidth
            label={t('fields.category')}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <MenuItem value="">{t('fields.noCategory')}</MenuItem>
            {incomeCategories.map((category) => (
              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            label={t('fields.notes')}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('dialog.cancel')}</Button>
        <Button variant="contained" disabled={!canSave} loading={busy} onClick={() => void save()}>
          {certificate ? t('dialog.save') : t('dialog.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
