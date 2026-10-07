import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Divider,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
  alpha,
} from '@mui/material';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { PendingReviewDialog } from './components/PendingReviewDialog';
import { MessageConnectionDialog } from './components/MessageConnectionDialog';
import { ImportedBatchCard } from './components/ImportedBatchCard';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';
import { Money } from '@/components/Money';
import { CheckCircleIcon, DocumentUploadIcon, HistoryIcon, KeyIcon } from '@/components/AppIcon';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useAccounts,
  useApprovePendingFinancialMessageMutation,
  useCategories,
  useDiscardPendingFinancialMessageMutation,
  usePendingFinancialMessages,
  useResolvedPendingFinancialMessages,
  useRestoreDiscardedPendingFinancialMessageMutation,
} from '@/hooks/useFinance';
import type { PendingFinancialMessage } from '@kippa/domain';
import { groupImportedPending } from '@/libs/messageHistoryImport';
import { useMessageConnections } from './hooks/useMessageConnections';
import { useSharedBalanceEntries } from '@/features/shared-balance/hooks/useSharedBalance';
import { pendingForViewerCount } from '@/libs/approvals';
import { SharedBalanceApprovalsCard } from './components/SharedBalanceApprovalsCard';
import { TransferApprovalsCard } from './components/TransferApprovalsCard';
import { RecurringConfirmationsCard } from './components/RecurringConfirmationsCard';
import { useRecurringDrafts } from '@/features/transactions/hooks/useRecurringTransactions';
import { useDraftTransfers } from '@/features/transactions/hooks/useTransferApprovals';
import { useSharedBalanceMembers } from '@/features/shared-balance/hooks/useSharedBalance';
import { usePendingReviewState } from './hooks/usePendingReviewState';
type PendingItemState = 'idle' | 'approving' | 'discarding' | 'settled';

const PREVIEW_PENDING_ITEMS: PendingFinancialMessage[] = [
  {
    id: 'preview-debit-purchase', householdId: 'preview', receivedBy: 'preview', kind: 'expense',
    source: 'ios-shortcut', provider: 'hsbc', amount: 325, currency: 'EGP', date: '2026-07-31',
    description: 'FAWRY · BEANOS', counterparty: 'FAWRY · BEANOS',
    messagePreview: 'HSBC card purchase · EGP 325.00 · 31 Jul 2026',
    suggestedAccountId: null, suggestedDestinationAccountId: null, createdAt: '2026-07-31T12:00:00.000Z', status: 'pending',
  },
  {
    id: 'preview-credit-purchase', householdId: 'preview', receivedBy: 'preview', kind: 'expense',
    source: 'ios-shortcut', provider: 'hsbc', amount: 999.99, currency: 'EGP', date: '2026-07-19',
    description: 'OPENAI · CHATGPT SUBSCR', counterparty: 'OPENAI · CHATGPT SUBSCR', accountHintLast4: '7281',
    messagePreview: 'HSBC credit-card purchase ending 7281 · EGP 999.99 · 19 Jul 2026',
    suggestedAccountId: null, suggestedDestinationAccountId: null, createdAt: '2026-07-31T11:00:00.000Z', status: 'pending',
  },
  {
    id: 'preview-inward', householdId: 'preview', receivedBy: 'preview', kind: 'income',
    source: 'ios-shortcut', provider: 'hsbc', amount: 225, currency: 'EGP', date: '2026-07-17',
    description: 'Incoming bank transfer',
    messagePreview: 'HSBC incoming transfer · EGP 225.00 · 17 Jul 2026',
    suggestedAccountId: null, suggestedDestinationAccountId: null, createdAt: '2026-07-31T10:00:00.000Z', status: 'pending',
  },
];

export function PendingTransactions() {
  const { t } = useTranslation('pendingTransactions');
  const navigate = useNavigate();
  const { userProfile, householdId } = useAppContext();
  const { closeSnackbar, enqueueSnackbar } = useSnackbar();
  const { data: remotePending = [], isLoading: remoteLoading } = usePendingFinancialMessages(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: members = [] } = useSharedBalanceMembers(householdId);
  const { data: sharedEntries = [] } = useSharedBalanceEntries(householdId);
  const { data: draftTransfers = [] } = useDraftTransfers(householdId);
  const { data: recurringDrafts = [] } = useRecurringDrafts(householdId);
  const approveMutation = useApprovePendingFinancialMessageMutation();
  const discardMutation = useDiscardPendingFinancialMessageMutation();
  const restoreMutation = useRestoreDiscardedPendingFinancialMessageMutation();
  const { data: resolved = [], isLoading: historyLoading } = useResolvedPendingFinancialMessages(householdId);
  const [tab, setTab] = useState<'review' | 'history'>('review');
  const { accountId, allocations, allocationsEnabled, categoryId, confirmDiscard, convertedAmount, destinationAccountId, selected, sharedBalanceTag, setAccountId, setAllocations, setAllocationsEnabled, setCategoryId, setConfirmDiscard, setConvertedAmount, setDestinationAccountId, setSelected, setSharedBalanceTag } = usePendingReviewState();
  const [itemStates, setItemStates] = useState<Record<string, PendingItemState>>({});
  const [setupOpen, setSetupOpen] = useState(false);
  const connections = useMessageConnections(householdId);
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview-pending') === '1';
  const pending = previewMode ? PREVIEW_PENDING_ITEMS : remotePending;
  const isLoading = previewMode ? false : remoteLoading;
  // History-import stages arrive in batches with their own bulk
  // approve-all / cancel-all actions; live bank messages keep the plain list.
  const importBatches = useMemo(() => groupImportedPending(pending), [pending]);
  const livePending = useMemo(
    () => pending.filter((item) => !item.importBatchId),
    [pending],
  );
  const viewerUid = userProfile?.uid ?? '';
  const pendingShared = sharedEntries.filter((entry) => entry.status === 'pending');
  const transfersAwaitingViewer = draftTransfers.filter((draft) => {
    const required = draft.transferDraft?.requiredApprovals ?? [];
    const decided = draft.transferDraft?.approvals.map((approval) => approval.uid) ?? [];
    return required.includes(viewerUid) && !decided.includes(viewerUid);
  }).length;
  const totalPendingCount = pending.length + pendingForViewerCount(pendingShared, viewerUid) + transfersAwaitingViewer + recurringDrafts.length;


  const availableCategories = useMemo(() => {
    if (!selected) return [];
    const expectedType = selected.kind === 'income' ? 'income' : 'expense';
    return categories.filter((category) => category.isActive && category.type === expectedType);
  }, [categories, selected]);

  const availableAccounts = useMemo(() => {
    if (!selected) return [];
    return accounts.filter((account) => account.isActive
      && (selected.conversionRequired ? account.id === selected.suggestedAccountId : account.currency === selected.currency));
  }, [accounts, selected]);

  const availableDestinationAccounts = useMemo(() => {
    if (!selected) return [];
    const targetCurrency = selected.destinationCurrency ?? selected.currency;
    return accounts.filter((account) => account.isActive && account.currency === targetCurrency && account.id !== accountId);
  }, [accounts, selected, accountId]);

  const openReview = (item: PendingFinancialMessage) => {
    if ((itemStates[item.id] ?? 'idle') !== 'idle') return;
    setSelected(item);
    setCategoryId(item.suggestedCategoryId ?? '');
    setAccountId(item.suggestedAccountId ?? '');
    setDestinationAccountId(item.suggestedDestinationAccountId ?? '');
    setConfirmDiscard(false);
    setConvertedAmount('');
    setSharedBalanceTag({ kind: 'none', counterpartyUid: '', share: '' });
    setAllocationsEnabled(false);
    setAllocations([]);
  };

  const closeReview = () => {
    if (approveMutation.isPending || discardMutation.isPending) return;
    setSelected(null);
    setConfirmDiscard(false);
    setSharedBalanceTag({ kind: 'none', counterpartyUid: '', share: '' });
    setAllocationsEnabled(false);
    setAllocations([]);
  };

  const approve = async () => {
    if (!selected || !accountId
      || (selected.kind !== 'transfer' && !selected.suggestedLoanId && !categoryId)
      || (selected.kind === 'transfer' && !destinationAccountId)
      || (selected.conversionRequired && !(Number(convertedAmount) > 0))
      || (allocationsEnabled && (allocations.length === 0
        || allocations.some((row) => !row.accountId || !(Number(row.amount) > 0))
        || Math.abs(allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0) - selected.amount) > 0.01))) return;
    if (previewMode && selected.id.startsWith('preview-')) {
      enqueueSnackbar(t('toasts.previewApproved'), { variant: 'success' });
      setSelected(null);
      return;
    }
    const pendingId = selected.id;
    setItemStates((current) => ({ ...current, [pendingId]: 'approving' }));
    try {
      await approveMutation.mutateAsync({
        householdId,
        pendingId: selected.id,
        categoryId: selected.suggestedLoanId ? undefined : categoryId,
        accountId,
        destinationAccountId: selected.kind === 'transfer' ? destinationAccountId : undefined,
        convertedAmount: selected.conversionRequired ? Number(convertedAmount) : undefined,
        sharedBalanceTag: sharedBalanceTag.kind === 'none' ? undefined : {
          kind: sharedBalanceTag.kind,
          counterpartyUid: sharedBalanceTag.counterpartyUid,
          ...(sharedBalanceTag.kind === 'split' ? { amount: Number(sharedBalanceTag.share) } : {}),
        },
        accountAllocations: allocationsEnabled
          ? allocations.map((row) => ({ accountId: row.accountId, amount: Number(row.amount) }))
          : undefined,
      });
      setItemStates((current) => ({ ...current, [pendingId]: 'settled' }));
      enqueueSnackbar(t('toasts.approved'), { variant: 'success' });
      setSelected(null);
      setConfirmDiscard(false);
    } catch (error) {
      setItemStates((current) => ({ ...current, [pendingId]: 'idle' }));
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.approveFailed'), { variant: 'error' });
    }
  };

  const discard = async () => {
    if (!selected) return;
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    if (previewMode && selected.id.startsWith('preview-')) {
      enqueueSnackbar(t('toasts.previewDiscarded'), { variant: 'info' });
      setSelected(null);
      setConfirmDiscard(false);
      return;
    }
    const discardedItem = selected;
    setItemStates((current) => ({ ...current, [discardedItem.id]: 'discarding' }));
    try {
      await discardMutation.mutateAsync({ householdId, pendingId: discardedItem.id });
      setItemStates((current) => ({ ...current, [discardedItem.id]: 'settled' }));
      enqueueSnackbar(t('toasts.discarded'), {
        variant: 'success',
        action: (snackbarKey) => (
          <Button
            color="inherit"
            size="small"
            onClick={async () => {
              closeSnackbar(snackbarKey);
              try {
                await restoreMutation.mutateAsync({ householdId, pendingId: discardedItem.id });
                setItemStates((current) => ({ ...current, [discardedItem.id]: 'idle' }));
                enqueueSnackbar(t('toasts.restored'), { variant: 'success' });
              } catch (error) {
                enqueueSnackbar(error instanceof Error ? error.message : t('toasts.restoreFailed'), { variant: 'error' });
              }
            }}
          >
            {t('undo')}
          </Button>
        ),
      });
      setSelected(null);
      setConfirmDiscard(false);
    } catch (error) {
      setItemStates((current) => ({ ...current, [discardedItem.id]: 'idle' }));
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.discardFailed'), { variant: 'error' });
    }
  };

  const restoreDiscarded = async (pendingId: string) => {
    try {
      await restoreMutation.mutateAsync({ householdId, pendingId });
      setItemStates((current) => ({ ...current, [pendingId]: 'idle' }));
      enqueueSnackbar(t('toasts.restoredForReview'), { variant: 'success' });
      setTab('review');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.restoreFailed'), { variant: 'error' });
    }
  };

  const activeConnections = connections.credentials.filter((credential) => credential.enabled).length;
  const selectedState = selected ? (itemStates[selected.id] ?? 'idle') : 'idle';
  const reviewBusy = selectedState === 'approving' || selectedState === 'discarding';

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        action={<Chip label={tab === 'review' ? t('page.pending', { count: totalPendingCount }) : t('page.resolved', { count: resolved.length })} color={tab === 'review' && totalPendingCount ? 'secondary' : 'default'} />}
      />

      <Box
        sx={{
          px: { xs: 2, sm: 2.5 },
          py: 2,
          borderRadius: 'card',
          bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.06),
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          flexDirection: { xs: 'column', sm: 'row' },
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <KeyIcon sx={{ color: 'primary.main' }} />
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 750 }}>{t('connection.title')}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {t('connection.subtitle')}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={() => setSetupOpen(true)}>
            {activeConnections ? t('connection.manage') : t('connection.connect')}
          </Button>
          <Button variant="outlined" startIcon={<DocumentUploadIcon />} onClick={() => navigate('/import-messages')}>
            {t('imported.importButton')}
          </Button>
        </Stack>
      </Box>

      <Tabs value={tab} onChange={(_, value: 'review' | 'history') => setTab(value)} variant="fullWidth">
        <Tab value="review" label={t('tabs.review')} />
        <Tab value="history" label={t('tabs.history')} icon={<HistoryIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {tab === 'review' && (
        <>
          <SharedBalanceApprovalsCard entries={pendingShared} />
          <TransferApprovalsCard members={members} />
          <RecurringConfirmationsCard />
          {importBatches.map((batch) => (
            <ImportedBatchCard
              key={batch.batchId}
              householdId={householdId}
              batchId={batch.batchId}
              items={batch.items}
              onOpenItem={openReview}
            />
          ))}
        </>
      )}

      {tab === 'review' && (isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={76} />)}
        </Stack>
      ) : pending.length === 0 && pendingShared.length === 0 && draftTransfers.length === 0 && recurringDrafts.length === 0 ? (
        <EmptyLayout
          icon={<CheckCircleIcon sx={{ fontSize: 28 }} />}
          title={t('reviewTab.emptyTitle')}
          description={t('reviewTab.emptyDescription')}
        />
      ) : livePending.length === 0 ? null : (
        <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800 }}>{t('reviewTab.detectedTitle')}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>{t('reviewTab.detectedHint')}</Typography>
          </Box>
          <Divider />
          {livePending.map((item, index) => (
            <Box key={item.id}>
              <Box
                component="button"
                type="button"
                onClick={() => openReview(item)}
                disabled={(itemStates[item.id] ?? 'idle') !== 'idle'}
                sx={{
                  width: '100%', minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25,
                  display: 'flex', alignItems: 'center', gap: 1.5, border: 0,
                  bgcolor: 'transparent', color: 'text.primary', textAlign: 'start', cursor: 'pointer',
                  opacity: (itemStates[item.id] ?? 'idle') === 'idle' ? 1 : 0.6,
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                {(itemStates[item.id] ?? 'idle') === 'idle'
                  ? <TransactionIcon type={item.kind} size={40} />
                  : <CircularProgress size={32} />}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{item.description}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      <Money amount={item.amount} code={item.currency} />
                    </Typography>
                  </Stack>
                  <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.25 }}>
                    {item.provider.toUpperCase()} · {item.kind} · {item.date}
                  </Typography>
                </Box>
              </Box>
              {index < livePending.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
            </Box>
          ))}
        </Card>
      ))}

      {tab === 'history' && (
        <SharedBalanceApprovalsCard entries={sharedEntries.filter((entry) => entry.status !== 'pending')} />
      )}

      {tab === 'history' && (historyLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={76} />)}
        </Stack>
      ) : resolved.length === 0 ? (
        <EmptyLayout
          icon={<HistoryIcon sx={{ fontSize: 28 }} />}
          title={t('historyTab.emptyTitle')}
          description={t('historyTab.emptyDescription')}
        />
      ) : (
        <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
            <CardHeading icon={<HistoryIcon variant="Bulk" />} title={t('historyTab.title')} subtitle={t('historyTab.subtitle')} />
          </Box>
          <Divider />
          {resolved.map((item, index) => {
            const restoring = restoreMutation.isPending && restoreMutation.variables?.pendingId === item.id;
            return (
              <Box key={item.id}>
                <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <TransactionIcon type={item.snapshot.kind} size={40} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{item.snapshot.description}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' }}>
                        <Money amount={item.snapshot.amount} code={item.snapshot.currency} />
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                      <Chip
                        label={item.state === 'approved' ? t('historyTab.approved') : t('historyTab.discarded')}
                        color={item.state === 'approved' ? 'success' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                      <Typography noWrap sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                        {new Date(item.resolvedAt).toLocaleString()} · {item.resolvedByDisplayName}
                      </Typography>
                    </Stack>
                  </Box>
                  {item.state === 'discarded' && (
                    <Button size="small" variant="outlined" disabled={restoring} onClick={() => restoreDiscarded(item.id)}>
                      {restoring ? t('historyTab.restoring') : t('historyTab.restore')}
                    </Button>
                  )}
                </Box>
                {index < resolved.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
              </Box>
            );
          })}
        </Card>
      ))}

      <PendingReviewDialog accountId={accountId} accounts={availableAccounts} busy={reviewBusy} categories={availableCategories} categoryId={categoryId} confirmDiscard={confirmDiscard} convertedAmount={convertedAmount} destinationAccountId={destinationAccountId} destinationAccounts={availableDestinationAccounts} item={selected} onAccountChange={setAccountId} onApprove={approve} onCategoryChange={setCategoryId} onClose={closeReview} onConvertedAmountChange={setConvertedAmount} onDestinationChange={setDestinationAccountId} onDiscard={discard} state={selectedState} members={members} sharedBalanceTag={sharedBalanceTag} onSharedBalanceTagChange={setSharedBalanceTag} allocationsEnabled={allocationsEnabled} allocations={allocations} onAllocationsEnabledChange={setAllocationsEnabled} onAllocationsChange={setAllocations} />

      <MessageConnectionDialog busy={connections.busy} credentials={connections.credentials} generated={connections.generated} onClose={() => setSetupOpen(false)} onCopy={connections.copy} onCreate={connections.create} onRevoke={connections.revoke} open={setupOpen} />
    </Stack>
  );
}
