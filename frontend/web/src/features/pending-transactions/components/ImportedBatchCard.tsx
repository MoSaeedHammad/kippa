import { useState } from 'react';
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
  Stack,
  Typography,
} from '@mui/material';
import type { PendingFinancialMessage } from '@kippa/domain';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';
import { Money } from '@/components/Money';
import { CheckCircleIcon, DeleteIcon, HistoryIcon } from '@/components/AppIcon';
import { useDecideImportBatchMutation } from '@/hooks/useFinance';

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
 * items per call) through the same per-item approve/discard logic used for
 * single reviews; items that cannot be auto-resolved stay pending.
 */
export function ImportedBatchCard({ householdId, batchId, items, onOpenItem }: ImportedBatchCardProps) {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const decideMutation = useDecideImportBatchMutation();
  const [decision, setDecision] = useState<PendingDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const dated = items
    .map((item) => item.date)
    .sort();
  const span = dated.length > 0 ? { from: dated[0], to: dated[dated.length - 1] } : null;
  const decided = async (action: PendingDecision) => {
    setDecision(null);
    setBusy(true);
    setProgress({ done: 0, total: items.length });
    let approved = 0;
    let discarded = 0;
    const skipped: { pendingId: string; reason: string }[] = [];
    try {
      for (let call = 0; call < MAX_DECIDE_CALLS; call++) {
        const result = await decideMutation.mutateAsync({ householdId, batchId, action, maxItems: ITEMS_PER_DECIDE_CALL });
        approved += result.approved;
        discarded += result.discarded;
        skipped.push(...result.skipped);
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
    if (action === 'approve' && approved > 0) {
      enqueueSnackbar(
        skipped.length > 0
          ? `${t('imported.doneApproved', { count: approved })} · ${t('imported.needsReview', { count: skipped.length })}`
          : t('imported.doneApproved', { count: approved }),
        { variant: 'success' },
      );
    }
    if (action === 'discard' && discarded > 0) {
      enqueueSnackbar(t('imported.doneDiscarded', { count: discarded }), { variant: 'success' });
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
      {items.map((item, index) => (
        <Box key={item.id}>
          <Box
            component="button"
            type="button"
            onClick={() => onOpenItem(item)}
            disabled={busy}
            sx={{
              width: '100%', minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25,
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
              </Typography>
            </Box>
          </Box>
          {index < items.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
        </Box>
      ))}

      <Dialog open={decision != null} onClose={() => (busy ? undefined : setDecision(null))}>
        <DialogTitle>{decision === 'approve' ? t('imported.approveTitle') : t('imported.cancelTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {decision === 'approve' ? t('imported.approveBody') : t('imported.cancelBody')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)} disabled={busy}>{t('imported.back')}</Button>
          <Button
            variant="contained"
            color={decision === 'approve' ? 'success' : 'error'}
            disabled={busy || decision == null}
            onClick={() => decision && void decided(decision)}
          >
            {t('imported.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
