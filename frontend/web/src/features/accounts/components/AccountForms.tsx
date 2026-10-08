import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { DeleteIcon } from '@/components/AppIcon';
import type { Account, AccountType, CurrencyCode, HouseholdMember } from '@kippa/domain';
import { CurrencySelect } from '@/features/shared/components/CurrencySelect';
import { accountLifecycleLib, type AccountWipePreview } from '@/libs/accountLifecycle';
import type accountsEn from '@/i18n/locales/en/accounts.json';

type TypeLabelKey = keyof typeof accountsEn['types'];
const TYPES: Array<{ labelKey: TypeLabelKey; value: AccountType }> = [{ labelKey: 'running', value: 'running' }, { labelKey: 'savings', value: 'savings' }, { labelKey: 'cash', value: 'cash' }, { labelKey: 'wallet', value: 'wallet' }];
function TypeSelect({ id, onChange, value }: { id: string; onChange: (value: AccountType) => void; value: AccountType }) { const { t } = useTranslation('accounts'); return <FormControl fullWidth><InputLabel id={id}>{t('form.accountType')}</InputLabel><Select labelId={id} value={value} label={t('form.accountType')} onChange={(event) => onChange(event.target.value as AccountType)}>{TYPES.map((type) => <MenuItem key={type.value} value={type.value}>{t(`types.${type.labelKey}`)}</MenuItem>)}</Select></FormControl>; }

function OwnerSelect({ id, members, onChange, value }: { id: string; members: HouseholdMember[]; onChange: (uid: string) => void; value: string }) {
  const { t } = useTranslation('accounts');
  return (
    <FormControl fullWidth>
      <InputLabel id={id}>{t('form.owner')}</InputLabel>
      <Select labelId={id} value={value} label={t('form.owner')} onChange={(event) => onChange(event.target.value)}>
        <MenuItem value="">{t('form.noOwner')}</MenuItem>
        {members.map((member) => <MenuItem key={member.uid} value={member.uid}>{member.displayName}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

export function AddAccountCard({ baseCurrency, busy, members, onCreate }: { baseCurrency: CurrencyCode; busy: boolean; members: HouseholdMember[]; onCreate: (draft: { name: string; type: AccountType; currency: CurrencyCode; ownerUid: string | null }) => Promise<void> }) {
  const { t } = useTranslation('accounts');
  const [draft, setDraft] = useState({ name: '', type: 'running' as AccountType, currency: baseCurrency, ownerUid: '' });
  const create = async () => { if (!draft.name.trim()) return; await onCreate({ ...draft, name: draft.name.trim(), ownerUid: draft.ownerUid || null }); setDraft((current) => ({ ...current, name: '', ownerUid: '' })); };
  return <Card sx={{ position: { lg: 'sticky' }, top: { lg: 24 } }}><CardContent><Stack spacing={2.5}><div><Typography variant="h3">{t('form.addTitle')}</Typography><Typography variant="body2" color="text.secondary">{t('form.addSubtitle')}</Typography></div><TextField fullWidth label={t('form.accountName')} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><TypeSelect id="acc-type-label" value={draft.type} onChange={(type) => setDraft({ ...draft, type })} /><CurrencySelect labelId="acc-currency-label" value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} /><OwnerSelect id="acc-owner-label" members={members} value={draft.ownerUid} onChange={(ownerUid) => setDraft({ ...draft, ownerUid })} /><Button fullWidth variant="contained" onClick={create} loading={busy}>{t('form.create')}</Button></Stack></CardContent></Card>;
}

export function EditAccountDialog({ account, busy, members, onClose, onSave, onDelete }: { account: Account; busy: boolean; members: HouseholdMember[]; onClose: () => void; onSave: (account: Account) => Promise<void>; onDelete?: () => Promise<void> }) {
  const { t } = useTranslation('accounts');
  const [draft, setDraft] = useState(account);
  // Two-step destructive wipe: preview what goes away, then confirm.
  const [wipeStep, setWipeStep] = useState<'idle' | 'confirm'>('idle');
  const [preview, setPreview] = useState<AccountWipePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const blockingLoan = preview?.blockingLoan ?? null;

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      setPreview(await accountLifecycleLib.previewWipe(account.householdId, account.id));
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
    setWipeStep('confirm');
  };

  const runWipe = async () => {
    if (!onDelete) return;
    setWipeBusy(true);
    try {
      await onDelete();
    } finally {
      setWipeBusy(false);
    }
  };

  return <Dialog open onClose={onClose}><DialogTitle>{t('form.editTitle')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField fullWidth label={t('form.accountName')} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><TypeSelect id="edit-acc-type-label" value={draft.type} onChange={(type) => setDraft({ ...draft, type })} /><CurrencySelect labelId="edit-acc-currency-label" value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} /><OwnerSelect id="edit-acc-owner-label" members={members} value={draft.ownerUid ?? ''} onChange={(ownerUid) => setDraft({ ...draft, ownerUid: ownerUid || null })} /><FormControlLabel control={<Checkbox checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />} label={t('form.isActive')} /></Stack>
    {onDelete && (
      <Stack spacing={1} sx={{ mt: 3 }}>
        {wipeStep === 'idle' ? (
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} loading={previewLoading} onClick={() => void loadPreview()}>
            {t('wipe.action')}
          </Button>
        ) : (
          <>
            {blockingLoan ? (
              <Alert severity="warning">{t('wipe.blockingLoan', { name: blockingLoan.name })}</Alert>
            ) : (
              <Alert severity="error">
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('wipe.warning', { name: account.name })}</Typography>
                {preview && (
                  <Typography variant="fieldHint" color="text.secondary">
                    {t('wipe.preview', { transactions: preview.transactions, cards: preview.cards })}
                  </Typography>
                )}
                {preview && preview.recurringRules.length > 0 && (
                  <Typography variant="fieldHint" color="text.secondary">
                    {t('wipe.recurring', { rules: preview.recurringRules.join(', ') })}
                  </Typography>
                )}
              </Alert>
            )}
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => setWipeStep('idle')}>{t('wipe.cancel')}</Button>
              {!blockingLoan && (
                <Button size="small" color="error" variant="contained" loading={wipeBusy} onClick={() => void runWipe()}>
                  {t('wipe.confirm')}
                </Button>
              )}
            </Stack>
          </>
        )}
      </Stack>
    )}
  </DialogContent><DialogActions><Button onClick={onClose}>{t('form.cancel')}</Button><Button onClick={() => onSave({ ...draft, name: draft.name.trim() })} variant="contained" loading={busy} disabled={!draft.name.trim()}>{t('form.saveChanges')}</Button></DialogActions></Dialog>;
}
