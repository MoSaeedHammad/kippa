import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import type { PendingFinancialMessage } from '@kippa/domain';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';
import { Money } from '@/components/Money';
import { CheckCircleIcon, DeleteIcon, ExpandLessIcon, ExpandMoreIcon, HistoryIcon, RefreshIcon } from '@/components/AppIcon';
import { useAccounts, useCategories, useDecideImportBatchMutation, useRefineImportBatchMutation, useTransactions } from '@/hooks/useFinance';
import { usePagedList } from '@/hooks/usePagedList';
import { ListPagination } from '@/features/shared/components/ListPagination';
import { recordedMerchantNames } from '@/libs/merchantAnalytics';
import { financeQueryKeys as keys } from '@/hooks/financeQueryKeys';
import { BatchItemQuickEditor } from './BatchItemQuickEditor';

const MAX_DECIDE_CALLS = 100;
const ITEMS_PER_DECIDE_CALL = 100;

type PendingDecision = 'approve' | 'discard';

type ImportedBatchCardProps = {
  householdId: string;
  batchId: string;
  items: PendingFinancialMessage[];
  /** Reuses the parent's per-item review dialog for manual passes. */
  onOpenItem: (item: PendingFinancialMessage) => void;
};

/**
 * One staged history import: shows the covered duration with bulk
 * Approve-all / Cancel-all. Bulk decisions loop the server callable (100
 * items per call, cursor-positioned) through the same per-item approve/discard
 * logic used for single reviews; items that cannot be auto-resolved stay
 * pending, and the toast says so — a fully blocked run must never fail
 * silently.
 */
export function ImportedBatchCard({ householdId, batchId, items, onOpenItem }: ImportedBatchCardProps) {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const decideMutation = useDecideImportBatchMutation();
  const refineMutation = useRefineImportBatchMutation();
  const queryClient = useQueryClient();
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const { data: transactions = [] } = useTransactions(householdId);
  const merchantOptions = useMemo(() => recordedMerchantNames(transactions), [transactions]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<PendingDecision | 'refine' | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const dated = items
    .map((item) => item.date)
    .sort();
  const span = dated.length > 0 ? { from: dated[0], to: dated[dated.length - 1] } : null;
  const itemsPage = usePagedList(items, 10);
  const decided = async (action: PendingDecision) => {
    setDecision(null);
    setBusy(true);
    setProgress({ done: 0, total: items.length });
    let approved = 0;
    let discarded = 0;
    const skipped: { pendingId: string; reason: string }[] = [];
    let cursor: string | null = null;
    try {
      for (let call = 0; call < MAX_DECIDE_CALLS; call++) {
        const result = await decideMutation.mutateAsync({
          householdId,
          batchId,
          action,
          maxItems: ITEMS_PER_DECIDE_CALL,
          ...(cursor ? { cursor } : {}),
        });
        approved += result.approved;
        discarded += result.discarded;
        skipped.push(...result.skipped);
        cursor = result.nextCursor ?? null;
        setProgress((current) => current
          ? { done: Math.min(current.done + result.approved + result.discarded + result.skipped.length, current.total), total: current.total }
          : current);
        if (!result.hasMore) break;
      }
    } catch {
      enqueueSnackbar(t('toasts.decideBatchFailed'), { variant: 'error' });
    } finally {
      setBusy(false);
      setProgress(null);
    }
    // Report the outcome even when nothing was decided — blocked messages
    // with their reasons are the only signal the bulk run ever gives.
    const reasonCounts: Record<string, number> = {};
    for (const skip of skipped) reasonCounts[skip.reason] = (reasonCounts[skip.reason] ?? 0) + 1;
    const reasons = [
      reasonCounts.needs_account ? t('imported.skippedAccount', { count: reasonCounts.needs_account }) : null,
      reasonCounts.needs_conversion ? t('imported.skippedConversion', { count: reasonCounts.needs_conversion }) : null,
      reasonCounts.needs_destination ? t('imported.skippedDestination', { count: reasonCounts.needs_destination }) : null,
    ].filter(Boolean);
    const reasonDetail = reasons.length > 0 ? ` (${reasons.join(', ')})` : '';
    if (action === 'approve') {
      enqueueSnackbar(
        skipped.length > 0
          ? `${t('imported.doneApproved', { count: approved })} · ${t('imported.needsReview', { count: skipped.length })}${reasonDetail}`
          : t('imported.doneApproved', { count: approved }),
        { variant: approved > 0 ? 'success' : 'warning' },
      );
    }
    if (action === 'discard') {
      enqueueSnackbar(
        skipped.length > 0
          ? `${t('imported.doneDiscarded', { count: discarded })} · ${t('imported.needsReview', { count: skipped.length })}${reasonDetail}`
          : t('imported.doneDiscarded', { count: discarded }),
        { variant: discarded > 0 ? 'success' : 'warning' },
      );
    }
  };

  // Re-runs template classification over the remaining pending messages with
  // the household's current rules — the fix path after adding a template.
  const refined = async () => {
    setDecision(null);
    setBusy(true);
    setProgress({ done: 0, total: items.length });
    let updated = 0;
    let unchanged = 0;
    let skippedCount = 0;
    let cursor: string | null = null;
    try {
      for (let call = 0; call < MAX_DECIDE_CALLS; call++) {
        const result = await refineMutation.mutateAsync({
          householdId,
          batchId,
          maxItems: ITEMS_PER_DECIDE_CALL,
          ...(cursor ? { cursor } : {}),
        });
        updated += result.refined;
        unchanged += result.unchanged;
        skippedCount += result.skipped.length;
        cursor = result.nextCursor ?? null;
        setProgress((current) => current
          ? { done: Math.min(current.done + result.refined + result.unchanged + result.skipped.length, current.total), total: current.total }
          : current);
        if (!result.hasMore) break;
      }
      const parts = [t('imported.doneRefined', { count: updated })];
      if (unchanged > 0) parts.push(t('imported.doneUnchanged', { count: unchanged }));
      if (skippedCount > 0) parts.push(t('imported.doneUnparsable', { count: skippedCount }));
      enqueueSnackbar(parts.join(' · '), { variant: updated > 0 ? 'success' : 'info' });
    } catch {
      enqueueSnackbar(t('toasts.refineBatchFailed'), { variant: 'error' });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <CardHeading
          icon={<HistoryIcon variant="Bulk" />}
          title={t('imported.title')}
          subtitle={t('imported.subtitle', { count: items.length })}
        />
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ sm: 'center' }}
          justifyContent={{ sm: 'space-between' }}
          sx={{ mt: 1.5 }}
        >
          <Typography variant="fieldHint">
            {span ? t('imported.span', { from: span.from, to: span.to }) : t('imported.reviewHint')}
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="outlined"
              startIcon={<CheckCircleIcon />}
              disabled={busy}
              onClick={() => setDecision('approve')}
            >
              {t('imported.approveAll')}
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              disabled={busy}
              onClick={() => setDecision('refine')}
            >
              {t('imported.refine')}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              disabled={busy}
              onClick={() => setDecision('discard')}
            >
              {t('imported.cancelAll')}
            </Button>
          </Stack>
        </Stack>
        {progress && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="fieldHint">
              {t('imported.progress', { done: progress.done, total: progress.total })}
            </Typography>
          </Stack>
        )}
      </Box>
      <Divider />
      {itemsPage.pageItems.map((item, index) => (
        <Box key={item.id}>
          <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
            <Box
              component="button"
              type="button"
              onClick={() => onOpenItem(item)}
              disabled={busy}
              sx={{
                flex: 1, minWidth: 0, minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25,
                display: 'flex', alignItems: 'center', gap: 1.5, border: 0,
                bgcolor: 'transparent', color: 'text.primary', textAlign: 'start', cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <TransactionIcon type={item.kind} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="sectionLabel" noWrap sx={{ flex: 1 }}>{item.description}</Typography>
                  <Typography variant="sectionLabel" sx={{ whiteSpace: 'nowrap' }}>
                    <Money amount={item.amount} code={item.currency} />
                  </Typography>
                </Stack>
                <Typography variant="fieldHint" noWrap sx={{ mt: 0.25 }}>
                  {item.provider.toUpperCase()} · {item.kind} · {item.date}
                  {item.conversionRequired ? ` · ${t('imported.needsConversionBadge')}` : ''}
                  {!item.suggestedAccountId ? ` · ${t('imported.needsAccountBadge')}` : ''}
                </Typography>
              </Box>
            </Box>
            <IconButton
              aria-label={expandedId === item.id ? t('imported.collapseEdit') : t('imported.quickEdit')}
              sx={{ mx: 1, alignSelf: 'center' }}
              disabled={busy}
              onClick={() => setExpandedId((current) => (current === item.id ? null : item.id))}
            >
              {expandedId === item.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          {expandedId === item.id && (
            <BatchItemQuickEditor
              item={item}
              accounts={accounts}
              categories={categories}
              merchantOptions={merchantOptions}
              onDone={() => {
                setExpandedId(null);
                void queryClient.invalidateQueries({ queryKey: keys.pendingMessages(householdId) });
              }}
            />
          )}
          {index < itemsPage.pageItems.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
        </Box>
      ))}
      <ListPagination
        page={itemsPage.page}
        pageCount={itemsPage.pageCount}
        total={itemsPage.total}
        pageSize={10}
        onChange={itemsPage.setPage}
      />

      <Dialog open={decision != null} onClose={() => (busy ? undefined : setDecision(null))}>
        <DialogTitle>
          {decision === 'approve' ? t('imported.approveTitle') : decision === 'refine' ? t('imported.refineTitle') : t('imported.cancelTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {decision === 'approve' ? t('imported.approveBody') : decision === 'refine' ? t('imported.refineBody') : t('imported.cancelBody')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)} disabled={busy}>{t('imported.back')}</Button>
          <Button
            variant="contained"
            color={decision === 'discard' ? 'error' : 'success'}
            disabled={busy || decision == null}
            onClick={() => (decision === 'refine' ? void refined() : decision && void decided(decision))}
          >
            {t('imported.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
