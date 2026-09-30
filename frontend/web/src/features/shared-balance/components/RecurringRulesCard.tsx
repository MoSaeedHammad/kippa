import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Card,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import type { HouseholdMember, RecurringSharedEntryRule } from '@kippa/domain';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { DeleteIcon, PauseIcon, PlayIcon, SyncAltIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { formatFrequencyPhrase, nextOccurrenceAfter } from '@/libs/recurringSharedEntries';
import { useRecurringRules, useUpsertRecurringRuleMutation } from '../hooks/useRecurringRules';

type Props = {
  householdId: string;
  viewerUid: string;
  members: HouseholdMember[];
};

export function RecurringRulesCard({ householdId, viewerUid, members }: Props) {
  const { t } = useTranslation('sharedBalance');
  const { data: rules = [] } = useRecurringRules(householdId);
  const upsertMutation = useUpsertRecurringRuleMutation(householdId);
  const { enqueueSnackbar } = useSnackbar();
  const busy = upsertMutation.isPending;

  if (rules.length === 0) return null;

  const nameOf = (uid: string) => members.find((member) => member.uid === uid)?.displayName ?? t('rules.memberFallback');
  const directionPhrase = (rule: RecurringSharedEntryRule): string => {
    if (rule.fromUid === viewerUid) return t('rules.youPayThem');
    if (rule.toUid === viewerUid) return t('rules.theyPayYou');
    return t('rules.memberPays', { from: nameOf(rule.fromUid), to: nameOf(rule.toUid) });
  };

  const act = async (rule: RecurringSharedEntryRule, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await upsertMutation.mutateAsync({ action, ruleId: rule.id });
      enqueueSnackbar(
        action === 'pause' ? t('rules.pausedToast') : action === 'resume' ? t('rules.resumedToast') : t('rules.cancelledToast'),
        { variant: 'success' },
      );
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : t('rules.couldNotUpdate'), { variant: 'error' });
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <CardHeading
          icon={<SyncAltIcon variant="Bulk" />}
          title={t('rules.title')}
          subtitle={t('rules.subtitle')}
        />
      </Box>
      <Divider />
      {rules.map((rule) => {
        const next = rule.status === 'active' ? nextOccurrenceAfter(rule) : null;
        return (
          <Stack
            key={rule.id}
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="cardSubtitle" sx={{ fontWeight: 700 }} noWrap>
                  {rule.typeLabel} · {directionPhrase(rule)}
                </Typography>
                {rule.status === 'paused' && <Chip label={t('rules.paused')} size="small" color="warning" />}
                {rule.status === 'cancelled' && <Chip label={t('rules.cancelled')} size="small" color="default" />}
              </Stack>
              <Typography variant="cardSubtitle" color="text.secondary">
                {formatFrequencyPhrase(rule)}{next ? ` · ${t('rules.next', { date: next })}` : ''}
              </Typography>
            </Box>
            <Typography variant="amountValue" color={rule.fromUid === viewerUid ? 'error.main' : 'success.main'}>
              <Money amount={rule.amount} code={rule.currency} />
            </Typography>
            {rule.createdBy === viewerUid && rule.status !== 'cancelled' && (
              <Stack direction="row" spacing={0.5}>
                {rule.status === 'active' ? (
                  <Tooltip title={t('rules.pauseTooltip')}>
                    <IconButton size="small" disabled={busy} onClick={() => act(rule, 'pause')}>
                      <PauseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title={t('rules.resumeTooltip')}>
                    <IconButton size="small" disabled={busy} onClick={() => act(rule, 'resume')}>
                      <PlayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={t('rules.cancelTooltip')}>
                  <IconButton size="small" color="error" disabled={busy} onClick={() => act(rule, 'cancel')}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Stack>
        );
      })}
    </Card>
  );
}
