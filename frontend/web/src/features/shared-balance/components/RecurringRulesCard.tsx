import { useSnackbar } from 'notistack';
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
import type { RecurringSharedEntryRule } from '@kippa/domain';
import { CardHeading } from '@/features/shared/components/CardHeading';
import { PauseIcon, PlayIcon, SyncAltIcon, TrashIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { formatFrequencyPhrase, nextOccurrenceAfter } from '@/libs/recurringSharedEntries';
import { useRecurringRules, useUpsertRecurringRuleMutation } from '../hooks/useRecurringRules';

type Props = {
  householdId: string;
  viewerUid: string;
};

function directionPhrase(rule: RecurringSharedEntryRule, viewerUid: string): string {
  if (rule.createdBy === rule.fromUid) {
    return rule.fromUid === viewerUid ? 'You pay them' : `${rule.fromDisplayName} pays ${rule.toDisplayName}`;
  }
  return rule.toUid === viewerUid ? 'They pay you' : `${rule.fromDisplayName} pays ${rule.toDisplayName}`;
}

export function RecurringRulesCard({ householdId, viewerUid }: Props) {
  const { data: rules = [] } = useRecurringRules(householdId);
  const upsertMutation = useUpsertRecurringRuleMutation(householdId);
  const { enqueueSnackbar } = useSnackbar();
  const busy = upsertMutation.isPending;

  if (rules.length === 0) return null;

  const act = async (rule: RecurringSharedEntryRule, action: 'pause' | 'resume' | 'cancel') => {
    try {
      await upsertMutation.mutateAsync({ action, ruleId: rule.id });
      enqueueSnackbar(
        action === 'pause' ? 'Recurring entry paused' : action === 'resume' ? 'Recurring entry resumed' : 'Recurring entry cancelled',
        { variant: 'success' },
      );
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not update the recurring entry', { variant: 'error' });
    }
  };

  return (
    <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <CardHeading
          icon={<SyncAltIcon variant="Bulk" />}
          title="Recurring entries"
          subtitle="Each occurrence lands as pending — the other member confirms it before it counts."
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
                  {rule.typeLabel} · {directionPhrase(rule, viewerUid)}
                </Typography>
                {rule.status === 'paused' && <Chip label="Paused" size="small" color="warning" />}
                {rule.status === 'cancelled' && <Chip label="Cancelled" size="small" color="default" />}
              </Stack>
              <Typography variant="cardSubtitle" color="text.secondary">
                {formatFrequencyPhrase(rule)}{next ? ` · next ${next}` : ''}
              </Typography>
            </Box>
            <Typography variant="amountValue" color={rule.fromUid === viewerUid ? 'error.main' : 'success.main'}>
              <Money amount={rule.amount} code={rule.currency} />
            </Typography>
            {rule.createdBy === viewerUid && rule.status !== 'cancelled' && (
              <Stack direction="row" spacing={0.5}>
                {rule.status === 'active' ? (
                  <Tooltip title="Pause">
                    <IconButton size="small" disabled={busy} onClick={() => act(rule, 'pause')}>
                      <PauseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title="Resume">
                    <IconButton size="small" disabled={busy} onClick={() => act(rule, 'resume')}>
                      <PlayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Cancel recurring entry">
                  <IconButton size="small" color="error" disabled={busy} onClick={() => act(rule, 'cancel')}>
                    <TrashIcon fontSize="small" />
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
