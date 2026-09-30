import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import type { Account, AccountType, CurrencyCode } from '@kippa/domain';
import { CurrencySelect } from '@/features/shared/components/CurrencySelect';
import type accountsEn from '@/i18n/locales/en/accounts.json';

type TypeLabelKey = keyof typeof accountsEn['types'];
const TYPES: Array<{ labelKey: TypeLabelKey; value: AccountType }> = [{ labelKey: 'running', value: 'running' }, { labelKey: 'savings', value: 'savings' }, { labelKey: 'cash', value: 'cash' }, { labelKey: 'wallet', value: 'wallet' }];
function TypeSelect({ id, onChange, value }: { id: string; onChange: (value: AccountType) => void; value: AccountType }) { const { t } = useTranslation('accounts'); return <FormControl fullWidth><InputLabel id={id}>{t('form.accountType')}</InputLabel><Select labelId={id} value={value} label={t('form.accountType')} onChange={(event) => onChange(event.target.value as AccountType)}>{TYPES.map((type) => <MenuItem key={type.value} value={type.value}>{t(`types.${type.labelKey}`)}</MenuItem>)}</Select></FormControl>; }

export function AddAccountCard({ baseCurrency, busy, onCreate }: { baseCurrency: CurrencyCode; busy: boolean; onCreate: (draft: { name: string; type: AccountType; currency: CurrencyCode }) => Promise<void> }) {
  const { t } = useTranslation('accounts');
  const [draft, setDraft] = useState({ name: '', type: 'running' as AccountType, currency: baseCurrency });
  const create = async () => { if (!draft.name.trim()) return; await onCreate({ ...draft, name: draft.name.trim() }); setDraft((current) => ({ ...current, name: '' })); };
  return <Card sx={{ position: { lg: 'sticky' }, top: { lg: 24 } }}><CardContent><Stack spacing={2.5}><div><Typography variant="h3">{t('form.addTitle')}</Typography><Typography variant="body2" color="text.secondary">{t('form.addSubtitle')}</Typography></div><TextField fullWidth label={t('form.accountName')} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><TypeSelect id="acc-type-label" value={draft.type} onChange={(type) => setDraft({ ...draft, type })} /><CurrencySelect labelId="acc-currency-label" value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} /><Button fullWidth variant="contained" onClick={create} loading={busy}>{t('form.create')}</Button></Stack></CardContent></Card>;
}

export function EditAccountDialog({ account, busy, onClose, onSave }: { account: Account; busy: boolean; onClose: () => void; onSave: (account: Account) => Promise<void> }) {
  const { t } = useTranslation('accounts');
  const [draft, setDraft] = useState(account);
  return <Dialog open onClose={onClose}><DialogTitle>{t('form.editTitle')}</DialogTitle><DialogContent><Stack spacing={2} sx={{ mt: 1 }}><TextField fullWidth label={t('form.accountName')} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /><TypeSelect id="edit-acc-type-label" value={draft.type} onChange={(type) => setDraft({ ...draft, type })} /><CurrencySelect labelId="edit-acc-currency-label" value={draft.currency} onChange={(currency) => setDraft({ ...draft, currency })} /><FormControlLabel control={<Checkbox checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />} label={t('form.isActive')} /></Stack></DialogContent><DialogActions><Button onClick={onClose}>{t('form.cancel')}</Button><Button onClick={() => onSave({ ...draft, name: draft.name.trim() })} variant="contained" loading={busy} disabled={!draft.name.trim()}>{t('form.saveChanges')}</Button></DialogActions></Dialog>;
}
