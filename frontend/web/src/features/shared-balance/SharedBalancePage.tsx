import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { SharedBalanceEntry } from '@kippa/domain';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { computeSharedBalance } from '@/libs/sharedBalance';
import { availableYears, filterEntriesByPeriod, type EntryPeriodFilter } from '@/libs/entryHistoryFilter';
import { useAppContext } from '@/hooks/useAppContext';
import { usePagedList } from '@/hooks/usePagedList';
import { ListPagination } from '@/features/shared/components/ListPagination';
import {
  useDecideSharedBalanceEntryMutation,
  useEditSharedBalanceEntryMutation,
  useProposeSharedBalanceEntryMutation,
  useSharedBalanceEntries,
  useSharedBalanceMembers,
} from './hooks/useSharedBalance';
import { useUpsertRecurringRuleMutation } from './hooks/useRecurringRules';
import { AddSharedBalanceEntryDialog, type AddSharedBalanceEntryInput } from './components/AddSharedBalanceEntryDialog';
import { SharedBalanceEntryItem } from './components/SharedBalanceEntryItem';
import { EntryHistoryFilter } from './components/EntryHistoryFilter';
import { RecurringRulesCard } from './components/RecurringRulesCard';

export function SharedBalancePage() {
  const { t } = useTranslation('sharedBalance');
  const { householdId, userProfile, userHouseholds } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const viewerUid = userProfile!.uid;
  const baseCurrency = userHouseholds.find((h) => h.id === householdId)?.baseCurrency ?? 'EGP';

  const { data: entries = [], isLoading } = useSharedBalanceEntries(householdId);
  const { data: members = [] } = useSharedBalanceMembers(householdId);
  const proposeMutation = useProposeSharedBalanceEntryMutation();
  const decideMutation = useDecideSharedBalanceEntryMutation();
  const editMutation = useEditSharedBalanceEntryMutation();
  const upsertRuleMutation = useUpsertRecurringRuleMutation(householdId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SharedBalanceEntry | null>(null);
  const [periodFilter, setPeriodFilter] = useState<EntryPeriodFilter>({
    year: new Date().getUTCFullYear(),
    month: 'all',
  });

  const balance = computeSharedBalance(entries, viewerUid);
  const pendingForViewer = entries.filter(
    (entry) => entry.status === 'pending' && entry.createdBy !== viewerUid,
  ).length;
  const years = availableYears(entries);
  const visibleEntries = filterEntriesByPeriod(entries, periodFilter);
  const entriesPage = usePagedList(visibleEntries, 10);
  const isFiltering = visibleEntries.length !== entries.length;
  const busy = proposeMutation.isPending || decideMutation.isPending || editMutation.isPending || upsertRuleMutation.isPending;

  const otherName = members.find((member) => member.uid !== viewerUid)?.displayName;
  const balanceCaption = balance > 0
    ? t('balance.owesYou', { name: otherName ?? t('balance.otherMemberFallback') })
    : balance < 0
      ? t('balance.youOwe', { name: otherName ?? t('balance.otherMemberFallbackLower') })
      : t('balance.allSettled');

  const closeDialog = () => {
    if (busy) return;
    setDialogOpen(false);
    setEditingEntry(null);
  };

  const handlePropose = async (input: AddSharedBalanceEntryInput) => {
    try {
      if (input.repeat !== 'none') {
        await upsertRuleMutation.mutateAsync({
          action: 'create',
          rule: {
            kind: input.kind,
            direction: input.direction,
            counterpartyUid: input.counterpartyUid,
            amount: input.amount,
            currency: input.currency,
            typeLabel: input.typeLabel,
            note: input.note,
            frequency: input.repeat,
            anchorDate: input.date,
          },
        });
        enqueueSnackbar(t('toasts.recurringScheduled'), { variant: 'success' });
      } else {
        await proposeMutation.mutateAsync({
          householdId,
          kind: input.kind,
          direction: input.direction,
          counterpartyUid: input.counterpartyUid,
          amount: input.amount,
          currency: input.currency,
          typeLabel: input.typeLabel,
          note: input.note,
          date: input.date,
        });
        enqueueSnackbar(t('toasts.entrySent'), { variant: 'success' });
      }
      setDialogOpen(false);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.couldNotAdd'), { variant: 'error' });
    }
  };

  const handleEditSubmit = async (input: { amount: number; typeLabel: string; note: string | null; date: string }) => {
    if (!editingEntry) return;
    try {
      await editMutation.mutateAsync({ householdId, entryId: editingEntry.id, ...input });
      enqueueSnackbar(t('toasts.entryUpdated'), { variant: 'success' });
      setDialogOpen(false);
      setEditingEntry(null);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.couldNotUpdate'), { variant: 'error' });
    }
  };

  const decide = async (entry: SharedBalanceEntry, action: 'approve' | 'reject' | 'cancel') => {
    try {
      await decideMutation.mutateAsync({ householdId, entryId: entry.id, action });
      enqueueSnackbar(
        action === 'approve' ? t('toasts.entryApproved') : action === 'reject' ? t('toasts.entryDeclined') : t('toasts.entryCancelled'),
        { variant: 'success' },
      );
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.couldNotUpdate'), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        action={
          <Button
            variant="contained"
            onClick={() => { setEditingEntry(null); setDialogOpen(true); }}
          >
            {t('page.addEntry')}
          </Button>
        }
      />

      <Card sx={{ px: { xs: 2, sm: 2.5 }, py: 2, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <SwapHorizIcon color="primary" />
          <Box>
            <Typography variant="sectionLabel">{balanceCaption}</Typography>
            <Typography variant="cardSubtitle" color="text.secondary">
              {t('balance.caption')}
            </Typography>
          </Box>
        </Stack>
        <Typography variant="amountValue" color={balance >= 0 ? 'success.main' : 'error.main'}>
          <Money amount={Math.abs(balance)} code={baseCurrency} />
        </Typography>
      </Card>

      {pendingForViewer > 0 && (
        <Chip
          label={t('pendingBadge', { count: pendingForViewer })}
          color="secondary"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}

      {isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={76} />)}
        </Stack>
      ) : entries.length === 0 ? (
        <EmptyLayout
          icon={<SwapHorizIcon sx={{ fontSize: 28 }} />}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <Stack spacing={1.5}>
          <EntryHistoryFilter years={years} value={periodFilter} onChange={setPeriodFilter} />
          <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
            <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
              <Typography variant="cardTitle">{t('entries.title')}</Typography>
              <Typography variant="cardSubtitle" color="text.secondary">
                {isFiltering
                  ? t('entries.showingFiltered', { visible: visibleEntries.length, total: entries.length })
                  : t('entries.newestFirst')}
              </Typography>
            </Box>
            <Divider />
            {visibleEntries.length === 0 ? (
              <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 3 }}>
                <Typography variant="cardSubtitle" color="text.secondary">
                  {t('entries.noneInPeriod')}
                </Typography>
              </Box>
            ) : (
              entriesPage.pageItems.map((entry) => (
                <SharedBalanceEntryItem
                  key={`${entry.id}_r${entry.revision}`}
                  entry={entry}
                  viewerUid={viewerUid}
                  busy={busy}
                  onApprove={(item) => decide(item, 'approve')}
                  onReject={(item) => decide(item, 'reject')}
                  onCancel={(item) => decide(item, 'cancel')}
                  onEdit={(item) => { setEditingEntry(item); setDialogOpen(true); }}
                />
              ))
            )}
            <ListPagination
              page={entriesPage.page}
              pageCount={entriesPage.pageCount}
              total={entriesPage.total}
              pageSize={10}
              onChange={entriesPage.setPage}
            />
          </Card>
        </Stack>
      )}

      <RecurringRulesCard householdId={householdId} viewerUid={viewerUid} members={members} />

      <AddSharedBalanceEntryDialog
        open={dialogOpen}
        busy={busy}
        entry={editingEntry}
        members={members}
        viewerUid={viewerUid}
        defaultCurrency={baseCurrency}
        onClose={closeDialog}
        onSubmit={handlePropose}
        onEditSubmit={handleEditSubmit}
      />
    </Stack>
  );
}
