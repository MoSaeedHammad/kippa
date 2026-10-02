import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import type { RecurringTransactionRule } from '@kippa/domain';
import { SyncAltIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { Money } from '@/components/Money';
import { useAppContext } from '@/hooks/useAppContext';
import { useUpsertRecurringTransactionRuleMutation, useRecurringTransactionRules } from '@/features/transactions/hooks/useRecurringTransactions';
import { nextOccurrenceAfter } from '@/libs/recurringSharedEntries';

/**
 * Management for recurring income/expense rules: pause, resume or cancel —
 * occurrences themselves are confirmed in the Approvals page.
 */
export function RecurringTransactionRulesCard() {
  const { t } = useTranslation('budgetCycles');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const { data: rules = [] } = useRecurringTransactionRules(householdId);
  const upsertMutation = useUpsertRecurringTransactionRuleMutation();

  if (rules.length === 0) return null;
  const act = async (rule: RecurringTransactionRule, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await upsertMutation.mutateAsync({ householdId, action, ruleId: rule.id });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('recurring.failed'), { variant: 'error' });
    }
  };

  return (
    <Card>
      <CardContent>
        <CardHeading icon={<SyncAltIcon variant="Bulk" />} title={t('recurring.title')} subtitle={t('recurring.subtitle')} />
        <Divider sx={{ my: 1.5 }} />
        {rules.map((rule) => {
          const next = rule.status === 'active' ? nextOccurrenceAfter(rule, new Date().toISOString().slice(0, 10)) : null;
          return (
            <Box key={rule.id} sx={{ py: 1, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <SyncAltIcon color={rule.type === 'income' ? 'success' : 'primary'} />
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography variant="body1" noWrap>{rule.description}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {next ? t('recurring.next', { date: next }) : t('recurring.noNext')}
                </Typography>
              </Box>
              <Chip label={t(`recurring.frequency.${rule.frequency}`)} size="small" variant="outlined" />
              <Typography variant="sectionLabel" sx={{ whiteSpace: 'nowrap' }}>
                <Money amount={rule.amount} code={rule.currency} />
              </Typography>
              <Stack direction="row" spacing={0.5}>
                {rule.status === 'active' ? (
                  <Button size="small" variant="text" disabled={upsertMutation.isPending} onClick={() => act(rule, 'pause')}>{t('recurring.pause')}</Button>
                ) : rule.status === 'paused' ? (
                  <Button size="small" variant="text" color="success" disabled={upsertMutation.isPending} onClick={() => act(rule, 'resume')}>{t('recurring.resume')}</Button>
                ) : null}
                {rule.status !== 'cancelled' && (
                  <Button size="small" variant="text" color="error" disabled={upsertMutation.isPending} onClick={() => act(rule, 'cancel')}>{t('recurring.cancel')}</Button>
                )}
              </Stack>
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
}
