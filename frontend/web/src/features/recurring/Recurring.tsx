import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Box, Button, Card, CardContent, Chip, Grid, Paper, Skeleton, Stack, Typography } from '@mui/material';
import type { Account, Category, RecurringTransactionRule } from '@kippa/domain';
import { AddIcon, DeleteIcon, PauseIcon, PlayIcon, SyncAltIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { useAppContext } from '@/hooks/useAppContext';
import { useAccounts, useCategories } from '@/hooks/useFinance';
import {
  useRecurringTransactionRules,
  useUpsertRecurringTransactionRuleMutation,
} from '@/features/transactions/hooks/useRecurringTransactions';
import { formatFrequencyPhrase, nextOccurrenceAfter } from '@/libs/recurringSharedEntries';
import type { RecurringRulePayload } from '@/libs/recurringTransactions';
import { RecurringRuleDialog, type RecurringRuleFormInput } from './RecurringRuleDialog';

/**
 * Transaction → Recurring: the manager for recurring expense, income and
 * transfer rules, modelled on the Loans page. Each due occurrence waits in
 * the Approvals page to be confirmed (with adjustment) or skipped.
 */
export function Recurring() {
  const { t } = useTranslation('recurring');
  const { enqueueSnackbar } = useSnackbar();
  const { householdId } = useAppContext();
  const { data: rules = [], isLoading } = useRecurringTransactionRules(householdId);
  const { data: accounts = [] } = useAccounts(householdId);
  const { data: categories = [] } = useCategories(householdId);
  const upsertMutation = useUpsertRecurringTransactionRuleMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransactionRule | null>(null);

  const accountName = (id?: string | null) => accounts.find((account) => account.id === id)?.name;
  const categoryName = (id: string | null | undefined) =>
    id ? categories.find((category) => category.id === id)?.name : undefined;

  const visibleRules = useMemo(() => {
    const rank = (rule: RecurringTransactionRule) => (rule.status === 'active' ? 0 : rule.status === 'paused' ? 1 : 2);
    return [...rules].sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt);
  }, [rules]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const save = async (input: RecurringRuleFormInput) => {
    try {
      const payload: RecurringRulePayload = editing
        ? { householdId, action: 'edit', ruleId: editing.id, ...input }
        : { householdId, action: 'create', ...input };
      await upsertMutation.mutateAsync(payload);
      enqueueSnackbar(editing ? t('toasts.updated') : t('toasts.created'), { variant: 'success' });
      setFormOpen(false);
      setEditing(null);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.failed'), { variant: 'error' });
    }
  };

  const act = async (rule: RecurringTransactionRule, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await upsertMutation.mutateAsync({ householdId, action, ruleId: rule.id });
      enqueueSnackbar(t(`toasts.${action}Success`), { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('toasts.failed'), { variant: 'error' });
    }
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        action={(
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            {t('page.create')}
          </Button>
        )}
      />

      {isLoading ? (
        <Grid container spacing={2}>
          {[1, 2].map((i) => (
            <Grid key={i} size={{ xs: 12, md: 6 }}><Skeleton variant="rounded" height={220} /></Grid>
          ))}
        </Grid>
      ) : visibleRules.length === 0 ? (
        <EmptyLayout
          icon={<SyncAltIcon />}
          title={t('empty.title')}
          description={t('empty.description')}
          action={(
            <Button variant="contained" onClick={openCreate}>{t('empty.createFirst')}</Button>
          )}
        />
      ) : (
        <Grid container spacing={2.5}>
          {visibleRules.map((rule) => {
            const nextDate = rule.status === 'active' ? nextOccurrenceAfter(rule) : null;
            const isTransfer = rule.type === 'transfer';
            return (
              <Grid key={rule.id} size={{ xs: 12, lg: 6 }}>
                <Card>
                  <CardContent>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Paper variant="cardHeaderIcon">
                            <SyncAltIcon variant="Bulk" color={rule.type === 'income' ? 'success' : isTransfer ? 'info' : 'primary'} />
                          </Paper>
                          <Box>
                            <Typography variant="loanTitle">
                              {rule.description || t('rule.untitled')}
                            </Typography>
                            <Typography variant="loanMeta" color="text.secondary">
                              {formatFrequencyPhrase(rule)}
                            </Typography>
                          </Box>
                        </Stack>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={t(`types.${rule.type}`)}
                            size="small" variant="outlined"
                            color={rule.type === 'income' ? 'success' : rule.type === 'transfer' ? 'info' : 'default'}
                          />
                          {rule.status !== 'active' && (
                            <Chip label={t(`status.${rule.status}`)} size="small" variant="outlined" color={rule.status === 'paused' ? 'warning' : 'default'} />
                          )}
                        </Stack>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography variant="loanMetric">
                          <Money amount={rule.amount} code={rule.currency} maxDigits={2} />
                          {isTransfer && rule.destinationAmount != null && rule.destinationCurrency && (
                            <Typography component="span" variant="loanMeta" color="text.secondary">
                              {' '}→ <Money amount={rule.destinationAmount} code={rule.destinationCurrency} maxDigits={2} />
                            </Typography>
                          )}
                        </Typography>
                        <Typography variant="fieldHint" color="text.secondary">
                          {t('rule.occurrences', { count: rule.occurrencesCreated })}
                        </Typography>
                      </Stack>

                      <Typography variant="body2" color="text.secondary">
                        {isTransfer
                          ? [accountName(rule.accountId), accountName(rule.destinationAccountId)].filter(Boolean).join(' → ')
                          : [accountName(rule.accountId), categoryName(rule.categoryId), rule.merchant ?? undefined].filter(Boolean).join(' · ')}
                      </Typography>

                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                          {nextDate ? t('rule.nextOccurrence', { date: nextDate }) : t('rule.noUpcoming')}
                        </Typography>
                      </Stack>

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                        <Button
                          variant="segmented" startIcon={<PauseIcon />}
                          onClick={() => act(rule, 'pause')}
                          disabled={rule.status !== 'active'}
                        >
                          {t('rule.pause')}
                        </Button>
                        <Button
                          variant="segmented" startIcon={<PlayIcon />}
                          onClick={() => act(rule, 'resume')}
                          disabled={rule.status !== 'paused'}
                        >
                          {t('rule.resume')}
                        </Button>
                        <Button
                          variant="segmented" startIcon={<DeleteIcon />}
                          color="error"
                          onClick={() => act(rule, 'cancel')}
                          disabled={rule.status === 'cancelled'}
                        >
                          {t('rule.cancel')}
                        </Button>
                        <Button
                          variant="segmented"
                          onClick={() => { setEditing(rule); setFormOpen(true); }}
                          sx={{ marginInlineStart: 'auto' }}
                        >
                          {t('rule.edit')}
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      <RecurringRuleDialog
        key={`recurring-form-${editing?.id ?? 'new'}-${formOpen}`}
        open={formOpen}
        rule={editing}
        accounts={accounts as Account[]}
        categories={categories as Category[]}
        busy={upsertMutation.isPending}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={save}
      />
    </Stack>
  );
}
