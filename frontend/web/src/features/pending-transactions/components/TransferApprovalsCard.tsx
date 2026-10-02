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
import type { FinanceTransaction } from '@kippa/domain';
import { SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import type { HouseholdMember } from '@kippa/domain';
import { useDecideDraftTransferMutation, useDraftTransfers } from '@/features/transactions/hooks/useTransferApprovals';

/**
 * Owner-approval section of the unified Approvals page: transfers between
 * accounts owned by different members wait here until every owner approves.
 */
export function TransferApprovalsCard({ members }: { members: HouseholdMember[] }) {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const { userProfile, householdId } = useAppContext();
  const viewerUid = userProfile!.uid;
  const { data: drafts = [] } = useDraftTransfers(householdId);
  const decideMutation = useDecideDraftTransferMutation();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (drafts.length === 0) return null;
  const nameOf = (uid: string) => members.find((member) => member.uid === uid)?.displayName ?? uid.slice(0, 6);

  const decide = async (transactionId: string, action: 'approve' | 'reject') => {
    setBusyId(transactionId);
    try {
      await decideMutation.mutateAsync({ householdId, transactionId, action });
      enqueueSnackbar(action === 'approve' ? t('transfers.toasts.approved') : t('transfers.toasts.declined'), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('transfers.toasts.failed'), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Typography variant="cardTitle">{t('transfers.title')}</Typography>
        <Typography variant="cardSubtitle" color="text.secondary">{t('transfers.subtitle')}</Typography>
      </Box>
      <Divider />
      {drafts.map((draft: FinanceTransaction, index) => {
        const draftData = draft.transferDraft!;
        const myDecision = draftData.approvals.some((approval) => approval.uid === viewerUid);
        const eligible = draftData.requiredApprovals.includes(viewerUid) && !myDecision;
        const remainingNames = draftData.requiredApprovals
          .filter((uid) => !draftData.approvals.some((approval) => approval.uid === uid))
          .map(nameOf)
          .join(', ');
        return (
          <Box key={draft.id}>
            <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SwapHorizIcon />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <StackGap>
                  <Chip label={t('transfers.typeChip')} size="small" variant="outlined" />
                  <Typography noWrap variant="fieldHint" color="text.secondary">
                    {nameOf(draft.createdBy)} · {draft.date}
                  </Typography>
                </StackGap>
                <StackGap>
                  <Chip
                    label={t('transfers.waitingFor', { names: remainingNames })}
                    size="small"
                    color="warning"
                    variant="outlined"
                  />
                </StackGap>
              </Box>
              <Typography variant="sectionLabel" sx={{ whiteSpace: 'nowrap' }}>
                <Money amount={draftData.amount} code={draftData.currency} />
              </Typography>
              {eligible && (
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                  <Button size="small" variant="contained" color="success" disabled={busyId === draft.id} onClick={() => decide(draft.id, 'approve')}>
                    {t('transfers.actions.approve')}
                  </Button>
                  <Button size="small" variant="outlined" color="error" disabled={busyId === draft.id} onClick={() => decide(draft.id, 'reject')}>
                    {t('transfers.actions.decline')}
                  </Button>
                </Box>
              )}
            </Box>
            {index < drafts.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
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
