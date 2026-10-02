import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Typography,
} from '@mui/material';
import type { SharedBalanceEntry } from '@kippa/domain';
import type { ApprovalEntryKind } from '@/libs/approvals';
import { SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { toSharedBalanceApprovalItems } from '@/libs/approvals';
import { useDecideSharedBalanceEntryMutation } from '@/features/shared-balance/hooks/useSharedBalance';
import { useAppContext } from '@/hooks/useAppContext';

type KindKey = 'iou' | 'split' | 'repayment';
const KIND_KEY: Record<ApprovalEntryKind, KindKey> = { iou: 'iou', split: 'split', repayment: 'repayment' };
type StatusKey = 'awaitsYou' | 'awaitsCounterparty' | 'approved' | 'rejected' | 'cancelled';

/**
 * The shared-balance section of the unified Approvals page. Pending entries
 * addressed to the viewer act inline (approve/decline); the viewer's own
 * pending entries and decided history render read-only.
 */
export function SharedBalanceApprovalsCard({ entries }: { entries: SharedBalanceEntry[] }) {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const { userProfile, householdId } = useAppContext();
  const viewerUid = userProfile!.uid;
  const decideMutation = useDecideSharedBalanceEntryMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  const items = toSharedBalanceApprovalItems(entries, viewerUid);
  if (items.length === 0) return null;

  const decide = async (entryId: string, action: 'approve' | 'reject') => {
    setBusyId(entryId);
    try {
      await decideMutation.mutateAsync({ householdId, entryId, action });
      enqueueSnackbar(action === 'approve' ? t('sharedBalance.toasts.approved') : t('sharedBalance.toasts.declined'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('sharedBalance.toasts.failed'), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Typography variant="cardTitle">{t('sharedBalance.title')}</Typography>
        <Typography variant="cardSubtitle" color="text.secondary">{t('sharedBalance.subtitle')}</Typography>
      </Box>
      <Divider />
      {items.map((item, index) => {
        const statusKey: StatusKey = item.status === 'pending'
          ? (item.awaitsViewer ? 'awaitsYou' : 'awaitsCounterparty')
          : item.status;
        return (
          <Box key={item.id}>
            <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SwapHorizIcon />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <StackGap>
                  <Chip label={t(`sharedBalance.kinds.${KIND_KEY[item.kind]}`)} size="small" variant="outlined" />
                  <Chip label={item.typeLabel} size="small" variant="filter" />
                  <Typography noWrap variant="fieldHint" color="text.secondary">
                    {item.createdByDisplayName} → {item.counterpartyDisplayName} · {item.date}
                  </Typography>
                </StackGap>
                <StackGap>
                  <Chip
                    label={t(`sharedBalance.status.${statusKey}`)}
                    size="small"
                    color={item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'default'}
                    variant="outlined"
                  />
                  {item.note && (
                    <Typography noWrap variant="fieldHint" color="text.secondary">{item.note}</Typography>
                  )}
                </StackGap>
              </Box>
              <Typography variant="sectionLabel" color="text.primary" sx={{ whiteSpace: 'nowrap' }}>
                <Money amount={item.amount} code={item.currency} />
              </Typography>
              {item.awaitsViewer && (
                <StackDirectionRow>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, 'approve')}
                  >
                    {t('sharedBalance.actions.approve')}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, 'reject')}
                  >
                    {t('sharedBalance.actions.decline')}
                  </Button>
                </StackDirectionRow>
              )}
            </Box>
            {index < items.length - 1 && <Divider sx={{ ms: 8.5 }} />}
          </Box>
        );
      })}
    </Card>
  );
}

function StackGap({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      {children}
    </Box>
  );
}

function StackDirectionRow({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
      {children}
    </Box>
  );
}
