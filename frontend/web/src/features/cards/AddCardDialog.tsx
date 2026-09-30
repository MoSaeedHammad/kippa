import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Typography, Box, IconButton, Grid, Divider, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { ArrowBackIcon } from '@/components/AppIcon';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts, useCreateDebitCardMutation, useCreateCreditCardMutation, useHouseholdBaseCurrency } from '@/hooks/useFinance';
import type { Card, CardKind, CardNetwork } from '@kippa/domain';
import { getBank, getTier } from './banks/banks';
import { BankPicker } from './BankPicker';
import { CardTile } from './CardTile';
import { useAddCardForm } from './hooks/useAddCardForm';

export function AddCardDialog({ open, preselectAccountId, onClose }: { open: boolean; preselectAccountId: string | null; onClose: () => void }) {
  return open ? (
    <AddCardDialogInner key={preselectAccountId ?? 'none'} preselectAccountId={preselectAccountId} onClose={onClose} />
  ) : null;
}

function AddCardDialogInner({ preselectAccountId, onClose }: { preselectAccountId: string | null; onClose: () => void }) {
  const { t } = useTranslation('cards');
  const { householdId } = useAppContext();
  const { data: accounts = [] } = useAccounts(householdId);
  const createDebit = useCreateDebitCardMutation();
  const createCredit = useCreateCreditCardMutation();
  const baseCurrency = useHouseholdBaseCurrency();

  const preAcc = preselectAccountId ? accounts.find(a => a.id === preselectAccountId) : undefined;
  const { bankId, creditLimit, currency, error, expiryMonth, expiryYear, kind, last4, name, network, parentAccountId, paymentAccountId, setBankId, setCreditLimit, setCurrency, setError, setExpiryMonth, setExpiryYear, setKind, setLast4, setName, setNetwork, setParentAccountId, setPaymentAccountId, setStep, setTierId, step, tierId } = useAddCardForm(preAcc?.currency ?? baseCurrency, preselectAccountId ?? '');

  const depositAccounts = accounts.filter(a => a.type === 'running' || a.type === 'savings');

  const bank = getBank(bankId);
  const bankTiers = bank?.tiers ?? [];
  const availableTiers = bankTiers.filter(t => t.kinds.includes(kind));
  const isOtherBank = bankTiers.length === 0;
  const tier = getTier(bankId, tierId);
  const availableNetworks: CardNetwork[] = tier?.networks ?? ['visa', 'mastercard', 'meeza', 'other'];

  const previewCard = {
    id: 'preview',
    householdId: householdId ?? 'preview',
    kind,
    name: name.trim() || bank?.name || 'Card',
    last4: last4 || undefined,
    network,
    bankId,
    tierId: tierId || undefined,
    currency,
    isActive: true,
    createdAt: new Date().toISOString(),
    parentAccountId: kind === 'debit' ? parentAccountId : '',
    expiryMonth: expiryMonth || undefined,
    expiryYear: expiryYear || undefined,
    creditLimit: kind === 'credit' && creditLimit ? Number(creditLimit) : undefined,
  } as Card;

  const goBackToBank = () => {
    setStep('bank');
    setBankId('');
    setTierId('');
  };

  const handleKindChange = (next: CardKind) => {
    setKind(next);
    setTierId('');
    // clamp network against the (possibly reset) tier's networks
    const nextTier = tier;
    if (nextTier && !nextTier.networks.includes(network)) {
      setNetwork(nextTier.networks[0]);
    }
  };

  const handleTierChange = (nextTierId: string) => {
    setTierId(nextTierId);
    const nextTier = getTier(bankId, nextTierId);
    if (nextTier && !nextTier.networks.includes(network)) {
      setNetwork(nextTier.networks[0]);
    }
  };

  const handleSave = async () => {
    setError('');
    try {
      const base = {
        kind, name: name.trim(), last4: last4 || undefined,
        network, currency, isActive: true,
        bankId, tierId: tierId || undefined,
        expiryMonth: expiryMonth || undefined,
        expiryYear: expiryYear || undefined,
        parentAccountId: kind === 'debit' ? parentAccountId : '',
      } as any;
      if (kind === 'debit') {
        await createDebit.mutateAsync({ householdId, card: base, accounts });
      } else {
        if (creditLimit === '' || !paymentAccountId) {
          setError(t('addDialog.creditRequired'));
          return;
        }
        const nextOrder = accounts.length > 0 ? Math.max(...accounts.map(a => a.sortOrder)) + 1 : 1;
        await createCredit.mutateAsync({
          householdId,
          card: { ...base, creditLimit: Number(creditLimit), paymentAccountId },
          accounts, sortOrder: nextOrder,
        });
      }
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  const isBankStep = step === 'bank';

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {!isBankStep && (
          <IconButton size="small" onClick={goBackToBank} sx={{ mr: 0.5 }}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        {isBankStep ? t('addDialog.title') : (bank?.name ?? t('addDialog.title'))}
      </DialogTitle>
      <DialogContent>
        {isBankStep ? (
          <Box sx={{ mt: 1 }}>
            <BankPicker onPick={id => { setBankId(id); setStep('details'); }} />
          </Box>
        ) : (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ maxWidth: 340 }}>
              <CardTile card={previewCard} />
            </Box>

            <Box sx={{ height: 32 }} />

            <Grid container spacing={2.5}>
              {/* ── Section 1: Card Type ─────────────────────────────── */}
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {t('addDialog.cardType')}
                </Typography>
                <Divider sx={{ mt: 1, mb: 1 }} />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={kind}
                  onChange={(_, v: CardKind | null) => v && handleKindChange(v)}
                  sx={{
                    gap: 1,
                    '& .MuiToggleButton-root': {
                      borderRadius: '12px',
                      border: '1px solid',
                      borderColor: 'divider',
                      textTransform: 'none',
                      fontWeight: 600,
                      py: 1.25,
                      color: 'text.secondary',
                      '&.Mui-selected': {
                        bgcolor: 'secondary.main',
                        color: 'secondary.contrastText',
                        borderColor: 'secondary.main',
                        '&:hover': { bgcolor: 'primary.dark' },
                      },
                    },
                  }}
                >
                  <ToggleButton value="debit">{t('kind.debit')}</ToggleButton>
                  <ToggleButton value="credit">{t('kind.credit')}</ToggleButton>
                </ToggleButtonGroup>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                {isOtherBank ? (
                  <TextField
                    label={t('addDialog.tier')}
                    value={tierId}
                    onChange={e => setTierId(e.target.value)}
                    placeholder={t('addDialog.tierPlaceholder')}
                    fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                  />
                ) : (
                  <FormControl fullWidth>
                    <InputLabel>{t('addDialog.tier')}</InputLabel>
                    <Select
                      value={tierId}
                      label={t('addDialog.tier')}
                      onChange={e => handleTierChange(e.target.value as string)}
                      sx={{ borderRadius: '12px' }}
                    >
                      {availableTiers.map(t => (
                        <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>{t('addDialog.network')}</InputLabel>
                  <Select
                    value={network}
                    label={t('addDialog.network')}
                    onChange={e => setNetwork(e.target.value as CardNetwork)}
                    sx={{ borderRadius: '12px' }}
                  >
                    {availableNetworks.map(n => (
                      <MenuItem key={n} value={n}>
                        {n.charAt(0).toUpperCase() + n.slice(1)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* ── Section 2: Card Details ──────────────────────────── */}
              <Grid size={{ xs: 12 }} sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {t('addDialog.cardDetails')}
                </Typography>
                <Divider sx={{ mt: 1, mb: 1 }} />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <TextField
                  label={t('addDialog.cardName')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={t('addDialog.last4')}
                  value={last4}
                  onChange={e => setLast4(e.target.value.slice(0, 4))}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                />
              </Grid>

              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label={t('addDialog.expiryMonth')}
                  type="number"
                  value={expiryMonth}
                  onChange={e => setExpiryMonth(e.target.value ? Number(e.target.value) : '')}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                />
              </Grid>

              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField
                  label={t('addDialog.expiryYear')}
                  type="number"
                  value={expiryYear}
                  onChange={e => setExpiryYear(e.target.value ? Number(e.target.value) : '')}
                  fullWidth
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                />
              </Grid>

              {/* ── Section 3: Account ───────────────────────────────── */}
              <Grid size={{ xs: 12 }} sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: 'primary.main', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {kind === 'debit' ? t('addDialog.linkedAccount') : t('addDialog.paymentAndLimit')}
                </Typography>
                <Divider sx={{ mt: 1, mb: 1 }} />
              </Grid>

              <Grid size={{ xs: 12, sm: kind === 'credit' ? 6 : 12 }}>
                <FormControl fullWidth>
                  <InputLabel>{kind === 'debit' ? t('addDialog.drawsFrom') : t('addDialog.paymentAccount')}</InputLabel>
                  <Select
                    value={kind === 'debit' ? parentAccountId : paymentAccountId}
                    label={kind === 'debit' ? t('addDialog.drawsFrom') : t('addDialog.paymentAccount')}
                    onChange={e => {
                      const id = e.target.value as string;
                      const acc = accounts.find(a => a.id === id);
                      if (kind === 'debit') setParentAccountId(id);
                      else setPaymentAccountId(id);
                      if (acc) setCurrency(acc.currency);
                    }}
                    sx={{ borderRadius: '12px' }}
                  >
                    {depositAccounts.map(a => (
                      <MenuItem key={a.id} value={a.id}>{a.name} ({a.currency})</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {kind === 'credit' && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={t('addDialog.creditLimit')}
                    type="number"
                    value={creditLimit}
                    onChange={e => setCreditLimit(e.target.value ? Number(e.target.value) : '')}
                    fullWidth
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '12px' } }}
                  />
                </Grid>
              )}

              {error && (
                <Grid size={{ xs: 12 }}>
                  <Typography color="error" variant="body2">{error}</Typography>
                </Grid>
              )}
            </Grid>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} color="inherit">{t('addDialog.cancel')}</Button>
        {!isBankStep && (
          <Button variant="contained" onClick={handleSave}
            disabled={!name.trim() || (kind === 'debit' ? !parentAccountId : !paymentAccountId)}
            sx={{ borderRadius: '12px', boxShadow: 'none' }}>
            {t('addDialog.saveCard')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
