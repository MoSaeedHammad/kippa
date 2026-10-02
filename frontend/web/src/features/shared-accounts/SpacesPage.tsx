import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AddIcon, SwitchAccountIcon, SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { useAppContext } from '@/hooks/useAppContext';
import { authLib } from '@/libs/auth';
import { sharedBalanceLib } from '@/libs/sharedBalance';
import { summarizeSharedAccounts, type SharedAccountSummary } from '@/libs/recurringSharedEntries';
import { ledgerLib } from '@/libs/ledger';
import { summarizeSpaceAccounts } from '@/libs/spaceSummary';

function accountsLine(summary: { accountsSummary: ReturnType<typeof summarizeSpaceAccounts> }): string {
  const { accountsCount, balances } = summary.accountsSummary;
  if (accountsCount === 0) return 'No accounts yet';
  const parts = balances.map((balance) => `${balance.currency} ${balance.amount.toLocaleString()}`);
  return `${accountsCount} ${accountsCount === 1 ? 'account' : 'accounts'}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

function useSharedAccountSummaries(enabled: boolean) {
  const { userHouseholds, userProfile } = useAppContext();
  const viewerUid = userProfile?.uid ?? '';
  const idsKey = userHouseholds.map((h) => h.id).join(',');
  return useQuery({
    queryKey: ['sharedAccountSummaries', idsKey, viewerUid],
    queryFn: async (): Promise<SharedAccountSummary[]> => {
      const input = await Promise.all(
        userHouseholds.map(async (household) => {
          const [entries, members, accounts, ledgerLines] = await Promise.all([
            sharedBalanceLib.getEntries(household.id),
            authLib.listHouseholdMembers(viewerUid, household.id).catch(() => []),
            ledgerLib.getAccounts(household.id).catch(() => []),
            ledgerLib.getLedgerLines(household.id).catch(() => []),
          ]);
          const accountsSummary = summarizeSpaceAccounts(accounts, ledgerLines);
          return { household, entries, members, accountsSummary };
        }),
      );
      return summarizeSharedAccounts(input, viewerUid);
    },
    enabled: enabled && userHouseholds.length > 0,
  });
}

export function SpacesPage() {
  const { t } = useTranslation('sharedAccounts');
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { userHouseholds, householdId, userProfile, isLoadingHouseholds, switchHousehold, createHousehold } = useAppContext();
  const viewerUid = userProfile!.uid;

  const { data: summaries = [], isLoading } = useSharedAccountSummaries(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const openAccount = async (summary: SharedAccountSummary) => {
    if (switchingId) return;
    setSwitchingId(summary.household.id);
    try {
      if (summary.household.id !== householdId) {
        await switchHousehold(summary.household.id);
      }
      navigate('/shared-balance');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.couldNotOpen'), { variant: 'error' });
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await createHousehold(newName.trim());
      enqueueSnackbar(t('toasts.spaceCreated'), { variant: 'success' });
      setDialogOpen(false);
      setNewName('');
      // The new account becomes the active one server-side.
      navigate('/shared-balance');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.couldNotCreate'), { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        action={
          <Button variant="contained" startIcon={<AddIcon fontSize="small" />} onClick={() => setDialogOpen(true)}>
            {t('page.newSpace')}
          </Button>
        }
      />

      {isLoadingHouseholds || (isLoading && userHouseholds.length > 0) ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
          {[0, 1].map((item) => <Skeleton key={item} variant="rounded" height={132} />)}
        </Box>
      ) : summaries.length === 0 ? (
        <EmptyLayout
          icon={<SwitchAccountIcon sx={{ fontSize: 28 }} />}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
          {summaries.map((summary) => {
            const otherName = summary.members.find((member) => member.uid !== viewerUid)?.displayName ?? t('card.otherMemberFallback');
            const balanceCaption = summary.balance > 0
              ? t('card.owesYou', { name: otherName })
              : summary.balance < 0
                ? t('card.youOwe', { name: otherName })
                : t('card.allSettled');
            const memberNames = summary.members.map((member) => member.displayName).slice(0, 3).join(', ');
            return (
              <Card
                key={summary.household.id}
                onClick={() => openAccount(summary)}
                sx={{ px: { xs: 2, sm: 2.5 }, py: 2, cursor: switchingId ? 'wait' : 'pointer' }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <SwapHorizIcon color="primary" />
                    <Typography variant="cardTitle" noWrap>{summary.household.name}</Typography>
                  </Stack>
                  {summary.household.id === householdId && <Chip label={t('card.active')} color="primary" size="small" />}
                </Stack>
                <Typography variant="cardSubtitle" color="text.secondary" sx={{ mt: 0.5 }}>
                  {memberNames || t('card.onlyYou')}
                </Typography>
                <Typography variant="cardSubtitle" color="text.secondary" sx={{ mt: 0.25 }}>
                  {accountsLine(summary)}
                </Typography>
                <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={1} sx={{ mt: 1.5 }}>
                  <Box>
                    <Typography variant="sectionLabel">{balanceCaption}</Typography>
                    <Typography variant="amountValue" color={summary.balance >= 0 ? 'success.main' : 'error.main'}>
                      <Money amount={Math.abs(summary.balance)} code={summary.household.baseCurrency} />
                    </Typography>
                  </Box>
                  {summary.pendingForMe > 0 && (
                    <Chip
                      label={t('pendingBadge', { count: summary.pendingForMe })}
                      color="secondary"
                      size="small"
                    />
                  )}
                </Stack>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => !creating && setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t('createDialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label={t('createDialog.name')}
            placeholder={t('createDialog.namePlaceholder')}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            helperText={t('createDialog.helper')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={creating}>{t('createDialog.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
            {t('createDialog.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
