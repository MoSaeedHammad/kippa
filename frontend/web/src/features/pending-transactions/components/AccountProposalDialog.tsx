import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Account, PendingFinancialMessage } from '@kippa/domain';
import { getBank } from '@/features/cards/banks/banks';
import { cardsLib } from '@/libs/cards';
import { useQueryClient } from '@tanstack/react-query';
import { financeQueryKeys as keys } from '@/hooks/financeQueryKeys';

const NETWORKS = ['visa', 'mastercard', 'meeza', 'other'] as const;

/**
 * One-click creation of the bank card a message named (e.g. "بطاقة بنك مصر
 * الائتمانية **2508") when no card in the household carries those digits.
 * Credit cards also create their debt account; debit cards link to a running
 * or savings account.
 */
export function AccountProposalDialog({ item, accounts, busy, onClose, onCreated }: {
  item: PendingFinancialMessage | null;
  accounts: Account[];
  busy: boolean;
  onClose: () => void;
  onCreated: (accountId: string) => void;
}) {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const proposal = item?.suggestedAccountProposal ?? null;
  const isCredit = proposal?.cardKind === 'credit';
  const bankName = proposal ? getBank(proposal.bankId)?.name ?? proposal.bankId : '';

  const [name, setName] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>('visa');
  const [linkAccountId, setLinkAccountId] = useState('');
  const [creating, setCreating] = useState(false);

  const defaultName = useMemo(() => {
    if (!proposal) return '';
    return `${bankName} ${isCredit ? 'Credit Card' : 'Debit Card'} ••${proposal.last4}`;
  }, [proposal, bankName, isCredit]);

  if (!proposal) return null;

  // Credit cards are paid from an account in the card currency (the message currency).
  const paymentAccounts = accounts.filter((account) => account.isActive
    && account.type !== 'credit'
    && (!isCredit || account.currency === item?.currency));
  // Debit cards link to a running or savings account.
  const parentAccounts = accounts.filter((account) => account.isActive
    && (account.type === 'running' || account.type === 'savings'));

  const effectiveName = name.trim() || defaultName;
  const effectiveLinkAccount = linkAccountId || (isCredit ? paymentAccounts[0]?.id ?? '' : parentAccounts[0]?.id ?? '');
  const canCreate = Boolean(effectiveName && effectiveLinkAccount && (!isCredit || Number(creditLimit) > 0));

  const create = async () => {
    if (!item || !proposal) return;
    setCreating(true);
    try {
      if (isCredit) {
        const { creditAccountId } = await cardsLib.createCreditCard(item.householdId, {
          name: effectiveName,
          kind: 'credit',
          bankId: proposal.bankId,
          last4: proposal.last4,
          network,
          parentAccountId: effectiveLinkAccount, // replaced by the new credit account inside createCreditCard
          creditLimit: Number(creditLimit),
          paymentAccountId: effectiveLinkAccount,
          currency: item.currency,
          isActive: true,
          expiryMonth: undefined,
          expiryYear: undefined,
        }, accounts, 100);
        await queryClient.invalidateQueries({ queryKey: keys.accounts(item.householdId) });
        await queryClient.invalidateQueries({ queryKey: keys.cards(item.householdId) });
        enqueueSnackbar(t('reviewDialog.proposal.created', { name: effectiveName }), { variant: 'success' });
        onCreated(creditAccountId);
      } else {
        const parentAccount = parentAccounts.find((account) => account.id === effectiveLinkAccount);
        await cardsLib.createDebitCard(item.householdId, {
          name: effectiveName,
          kind: 'debit',
          bankId: proposal.bankId,
          last4: proposal.last4,
          network,
          parentAccountId: effectiveLinkAccount,
          creditLimit: undefined,
          paymentAccountId: undefined,
          currency: parentAccount?.currency ?? item.currency,
          isActive: true,
          expiryMonth: undefined,
          expiryYear: undefined,
        }, accounts);
        await queryClient.invalidateQueries({ queryKey: keys.cards(item.householdId) });
        enqueueSnackbar(t('reviewDialog.proposal.created', { name: effectiveName }), { variant: 'success' });
        onCreated(effectiveLinkAccount);
      }
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('reviewDialog.proposal.failed'), { variant: 'error' });
    } finally {
      setCreating(false);
      onClose();
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t('reviewDialog.proposal.title', { bank: bankName })}
        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {t('reviewDialog.proposal.subtitle', { last4: proposal.last4 })}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            fullWidth
            label={t('reviewDialog.proposal.name')}
            value={effectiveName}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            select fullWidth
            label={t('reviewDialog.proposal.network')}
            value={network}
            onChange={(event) => setNetwork(event.target.value as (typeof NETWORKS)[number])}
          >
            {NETWORKS.map((option) => (
              <MenuItem key={option} value={option} sx={{ textTransform: 'capitalize' }}>{option}</MenuItem>
            ))}
          </TextField>
          {isCredit ? (
            <>
              <TextField
                fullWidth type="number"
                label={t('reviewDialog.proposal.creditLimit', { currency: item?.currency ?? '' })}
                value={creditLimit}
                onChange={(event) => setCreditLimit(event.target.value)}
                error={creditLimit !== '' && !(Number(creditLimit) > 0)}
              />
              <TextField
                select fullWidth
                label={t('reviewDialog.proposal.paymentAccount')}
                value={effectiveLinkAccount}
                onChange={(event) => setLinkAccountId(event.target.value)}
              >
                {paymentAccounts.map((account) => (
                  <MenuItem key={account.id} value={account.id}>{account.name} ({account.currency})</MenuItem>
                ))}
              </TextField>
            </>
          ) : (
            <TextField
              select fullWidth
              label={t('reviewDialog.proposal.linkAccount')}
              value={effectiveLinkAccount}
              onChange={(event) => setLinkAccountId(event.target.value)}
            >
              {parentAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>{account.name} ({account.currency})</MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('reviewDialog.proposal.cancel')}</Button>
        <Button variant="contained" disabled={!canCreate} loading={busy || creating} onClick={() => void create()}>
          {t('reviewDialog.proposal.create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
