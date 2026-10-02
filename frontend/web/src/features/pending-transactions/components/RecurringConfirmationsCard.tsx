import { Box, Button, Card, Chip, Divider, Typography } from '@mui/material';
import type { FinanceTransaction } from '@kippa/domain';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { SyncAltIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts } from '@/hooks/useFinance';
import { useDecideRecurringDraftMutation, useRecurringDrafts } from '@/features/transactions/hooks/useRecurringTransactions';

/**
 * Recurring confirmations section of the unified Approvals page: each due
 * occurrence of a recurring income/expense rule waits here until a member
 * confirms (posts) or skips (voids) it.
 */
export function RecurringConfirmationsCard() {
  const { t } = useTranslation('pendingTransactions');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const { data: drafts = [] } = useRecurringDrafts(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const decideMutation = useDecideRecurringDraftMutation();

  if (drafts.length === 0) return null;
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.name;

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Typography variant="cardTitle">{t('recurring.title')}</Typography>
        <Typography variant="cardSubtitle" color="text.secondary">{t('recurring.subtitle')}</Typography>
      </Box>
      <Divider />
      {drafts.map((draft: FinanceTransaction, index) => {
        const draftData = draft.recurringDraft!;
        return (
          <Box key={draft.id}>
            <Box sx={{ minHeight: 72, px: { xs: 2, sm: 2.5 }, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <SyncAltIcon color={draft.type === 'income' ? 'success' : 'primary'} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip label={draft.type === 'income' ? t('recurring.income') : t('recurring.expense')} size="small" variant="outlined" />
                  <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{draft.description}</Typography>
                </Box>
                <Typography noWrap variant="fieldHint" color="text.secondary">
                  {draft.date}{accountName(draftData.accountId) ? ` · ${accountName(draftData.accountId)}` : ''}
                </Typography>
              </Box>
              <Typography variant="sectionLabel" color={draft.type === 'income' ? 'success.main' : 'text.primary'} sx={{ whiteSpace: 'nowrap' }}>
                {draft.type === 'income' ? '+' : '−'}<Money amount={draftData.amount} code={draftData.currency} />
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <Button
                  size="small" variant="contained" color="success"
                  disabled={decideMutation.isPending && decideMutation.variables?.transactionId === draft.id}
                  onClick={async () => {
                    try {
                      await decideMutation.mutateAsync({ householdId, transactionId: draft.id, action: 'confirm' });
                      enqueueSnackbar(t('recurring.toasts.confirmed'), { variant: 'success' });
                    } catch (error) {
                      enqueueSnackbar(error instanceof Error ? error.message : t('recurring.toasts.failed'), { variant: 'error' });
                    }
                  }}
                >
                  {t('recurring.actions.confirm')}
                </Button>
                <Button
                  size="small" variant="outlined" color="error"
                  disabled={decideMutation.isPending && decideMutation.variables?.transactionId === draft.id}
                  onClick={async () => {
                    try {
                      await decideMutation.mutateAsync({ householdId, transactionId: draft.id, action: 'skip' });
                      enqueueSnackbar(t('recurring.toasts.skipped'), { variant: 'success' });
                    } catch (error) {
                      enqueueSnackbar(error instanceof Error ? error.message : t('recurring.toasts.failed'), { variant: 'error' });
                    }
                  }}
                >
                  {t('recurring.actions.skip')}
                </Button>
              </Box>
            </Box>
            {index < drafts.length - 1 && <Divider sx={{ marginInlineStart: 8.5 }} />}
          </Box>
        );
      })}
    </Card>
  );
}
