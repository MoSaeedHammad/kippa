import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { TransactionListItem, TransactionListItemDivider, ListItemSpinner } from '@/features/transactions/components/TransactionListItem';
import { Money } from '@/components/Money';
import { CheckCircleIcon, DocumentUploadIcon, HistoryIcon, KeyIcon } from '@/components/AppIcon';
import { providerBankName } from '@/libs/transactionPresentation';
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
import type { AccountType, PendingFinancialMessage, ResolvedPendingFinancialMessage } from '@kippa/domain';
import { groupImportedPending } from '@/libs/messageHistoryImport';
import { ledgerLib } from '@/libs/ledger';
import { financeQueryKeys as keys } from '@/hooks/financeQueryKeys';
import { useQueryClient } from '@tanstack/react-query';
import { CreateAccountDialog, CreateCategoryDialog } from './components/QuickCreateDialogs';
import { AccountProposalDialog } from './components/AccountProposalDialog';
import { useMessageConnections } from './hooks/useMessageConnections';
import { useSharedBalanceEntries } from '@/features/shared-balance/hooks/useSharedBalance';
import { pendingForViewerCount } from '@/libs/approvals';
import { SharedBalanceApprovalsCard } from './components/SharedBalanceApprovalsCard';
import { TransferApprovalsCard } from './components/TransferApprovalsCard';
import { RecurringConfirmationsCard } from './components/RecurringConfirmationsCard';
import { LoanDueCard } from './components/LoanDueCard';
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
  const { accountId, allocations, allocationsEnabled, categoryId, confirmDiscard, convertedAmount, destinationAccountId, merchant, selected, sharedBalanceTag, setAccountId, setAllocations, setAllocationsEnabled, setCategoryId, setConfirmDiscard, setConvertedAmount, setDestinationAccountId, setMerchant, setSelected, setSharedBalanceTag } = usePendingReviewState();
  const [itemStates, setItemStates] = useState<Record<string, PendingItemState>>({});
  const [setupOpen, setSetupOpen] = useState(false);
  const queryClient = useQueryClient();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false);
  const [detailResolved, setDetailResolved] = useState<ResolvedPendingFinancialMessage | null>(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
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
    setMerchant(item.counterparty ?? '');
    setConfirmDiscard(false);
    setConvertedAmount('');
    setSharedBalanceTag({ kind: 'none', counterpartyUid: '', share: '' });
    setAllocationsEnabled(false);
    setAllocations([]);
  };

  const closeReview = () => {
    if (approveMutation.isPending || discardMutation.isPending) return;
    setSelected(null);
    setMerchant('');
    setConfirmDiscard(false);
    setSharedBalanceTag({ kind: 'none', counterpartyUid: '', share: '' });
    setAllocationsEnabled(false);
    setAllocations([]);
  };

  const approve = async () => {
    if (!selected || !accountId
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
        merchant: merchant.trim() ? merchant.trim() : undefined,
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

  const createCategoryAndSelect = async (name: string) => {
    if (!selected) return;
    setCreatingCategory(true);
    try {
      const id = await ledgerLib.createCategory(householdId, {
        name,
        type: selected.kind === 'income' ? 'income' : 'expense',
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: keys.categories(householdId) });
      setCategoryId(id);
      setCategoryDialogOpen(false);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.createFailed'), { variant: 'error' });
    } finally {
      setCreatingCategory(false);
    }
  };

  const createAccountAndSelect = async (input: { name: string; type: AccountType; currency: string }) => {
    setCreatingAccount(true);
    try {
      const id = await ledgerLib.createAccount(householdId, {
        name: input.name,
        type: input.type,
        currency: input.currency,
        isActive: true,
        sortOrder: 100,
        ownerUid: null,
      });
      await queryClient.invalidateQueries({ queryKey: keys.accounts(householdId) });
      setAccountId(id);
      setAccountDialogOpen(false);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.createFailed'), { variant: 'error' });
    } finally {
      setCreatingAccount(false);
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
          <LoanDueCard />
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
            <CardHeading icon={<HistoryIcon variant="Bulk" />} title={t('reviewTab.detectedTitle')} subtitle={t('reviewTab.detectedHint')} />
          </Box>
          <Divider />
          {livePending.map((item, index) => (
            <Box key={item.id}>
              <TransactionListItem
                leading={(itemStates[item.id] ?? 'idle') === 'idle'
                  ? <TransactionIcon type={item.kind} size={40} />
                  : <ListItemSpinner />}
                title={item.description}
                amount={<Money amount={item.amount} code={item.currency} />}
                subtitle={[
                  providerBankName(item.provider)?.toUpperCase() ?? item.provider.toUpperCase(),
                  item.kind,
                  item.date,
                  item.accountHintLast4 ? `•• ${item.accountHintLast4}` : undefined,
                  item.matchedTemplateName ? t('reviewTab.templateChip', { name: item.matchedTemplateName }) : undefined,
                ].filter(Boolean).join(' · ')}
                onClick={() => openReview(item)}
                disabled={(itemStates[item.id] ?? 'idle') !== 'idle'}
              />
              {index < livePending.length - 1 && <TransactionListItemDivider />}
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
                <TransactionListItem
                  leading={<TransactionIcon type={item.snapshot.kind} size={40} />}
                  title={item.snapshot.description}
                  amount={<Money amount={item.snapshot.amount} code={item.snapshot.currency} />}
                  metaChips={(
                    <Chip
                      label={item.state === 'approved' ? t('historyTab.approved') : t('historyTab.discarded')}
                      color={item.state === 'approved' ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  )}
                  subtitle={[
                    providerBankName(item.snapshot.provider)?.toUpperCase() ?? item.snapshot.provider.toUpperCase(),
                    item.snapshot.kind,
                    item.snapshot.date,
                    item.snapshot.accountHintLast4 ? `•• ${item.snapshot.accountHintLast4}` : undefined,
                    new Date(item.resolvedAt).toLocaleString(),
                    item.resolvedByDisplayName,
                  ].filter(Boolean).join(' · ')}
                  onClick={() => setDetailResolved(item)}
                  trailing={item.state === 'discarded' ? (
                    <Button size="small" variant="outlined" disabled={restoring} onClick={() => restoreDiscarded(item.id)}>
                      {restoring ? t('historyTab.restoring') : t('historyTab.restore')}
                    </Button>
                  ) : undefined}
                />
                {index < resolved.length - 1 && <TransactionListItemDivider />}
              </Box>
            );
          })}
        </Card>
      ))}

      <PendingReviewDialog accountId={accountId} accounts={availableAccounts} busy={reviewBusy} categories={availableCategories} categoryId={categoryId} confirmDiscard={confirmDiscard} convertedAmount={convertedAmount} destinationAccountId={destinationAccountId} destinationAccounts={availableDestinationAccounts} item={selected} merchant={merchant} onMerchantChange={setMerchant} onCreateAccount={() => setAccountDialogOpen(true)} onCreateCategory={() => setCategoryDialogOpen(true)} onAccountChange={setAccountId} onApprove={approve} onCategoryChange={setCategoryId} onClose={closeReview} onConvertedAmountChange={setConvertedAmount} onDestinationChange={setDestinationAccountId} onDiscard={discard} state={selectedState} members={members} sharedBalanceTag={sharedBalanceTag} onSharedBalanceTagChange={setSharedBalanceTag} allocationsEnabled={allocationsEnabled} allocations={allocations} onAllocationsEnabledChange={setAllocationsEnabled} onAllocationsChange={setAllocations} onAcceptProposal={() => setProposalDialogOpen(true)} />

      <MessageConnectionDialog busy={connections.busy} credentials={connections.credentials} generated={connections.generated} onClose={() => setSetupOpen(false)} onCopy={connections.copy} onCreate={connections.create} onRevoke={connections.revoke} open={setupOpen} />

      <CreateCategoryDialog open={categoryDialogOpen} busy={creatingCategory} categoryType={selected?.kind === 'income' ? 'income' : 'expense'} onClose={() => setCategoryDialogOpen(false)} onCreate={(name) => void createCategoryAndSelect(name)} />
      <CreateAccountDialog open={accountDialogOpen} busy={creatingAccount} defaultCurrency={selected?.currency ?? 'EGP'} onClose={() => setAccountDialogOpen(false)} onCreate={(input) => void createAccountAndSelect(input)} />
      {detailResolved && (
        <Dialog open onClose={() => setDetailResolved(null)} fullWidth maxWidth="xs">
          <DialogTitle>
            {detailResolved.snapshot.description}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('historyTab.resolvedOn', { name: detailResolved.resolvedByDisplayName, date: new Date(detailResolved.resolvedAt).toLocaleString() })}
            </Typography>
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <Box>
                <Typography variant="amountValue">
                  <Money amount={detailResolved.snapshot.amount} code={detailResolved.snapshot.currency} maxDigits={2} />
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={detailResolved.state === 'approved' ? t('historyTab.approved') : t('historyTab.discarded')}
                    color={detailResolved.state === 'approved' ? 'success' : 'default'}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Box>
              <Divider />
              <Stack spacing={1}>
                {([
                  [t('historyTab.detailBank'), providerBankName(detailResolved.snapshot.provider)?.toUpperCase() ?? detailResolved.snapshot.provider.toUpperCase()],
                  [t('historyTab.detailKind'), detailResolved.snapshot.kind],
                  [t('historyTab.detailDate'), detailResolved.snapshot.date],
                  detailResolved.snapshot.accountHintLast4 ? [t('historyTab.detailCard'), `•• ${detailResolved.snapshot.accountHintLast4}`] : null,
                  detailResolved.snapshot.counterparty ? [t('historyTab.detailMerchant'), detailResolved.snapshot.counterparty] : null,
                ].filter(Boolean) as [string, string][]).map(([label, value]) => (
                  <Stack key={label} direction="row" justifyContent="space-between" spacing={2}>
                    <Typography variant="fieldHint" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{label}</Typography>
                    <Typography variant="body2" sx={{ textAlign: 'end', minWidth: 0 }}>{value}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Divider />
              <Box>
                <Typography variant="sectionLabel" color="primary">{t('reviewDialog.bankMessage')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{detailResolved.snapshot.messagePreview}</Typography>
              </Box>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={() => setDetailResolved(null)}>{t('historyTab.close')}</Button>
          </DialogActions>
        </Dialog>
      )}

      {proposalDialogOpen && selected?.suggestedAccountProposal && (
        <AccountProposalDialog
          item={selected}
          accounts={accounts}
          busy={reviewBusy}
          onClose={() => setProposalDialogOpen(false)}
          onCreated={(accountId) => {
            setProposalDialogOpen(false);
            setAccountId(accountId);
          }}
        />
      )}
    </Stack>
  );
}
