import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AddIcon, SwitchAccountIcon, SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { useAppContext } from '@/hooks/useAppContext';
import { authLib } from '@/libs/auth';
import { sharedBalanceLib } from '@/libs/sharedBalance';
import { summarizeSharedAccounts, type SharedAccountSummary } from '@/libs/recurringSharedEntries';

function useSharedAccountSummaries(enabled: boolean) {
  const { userHouseholds, userProfile } = useAppContext();
  const viewerUid = userProfile?.uid ?? '';
  const idsKey = userHouseholds.map((h) => h.id).join(',');
  return useQuery({
    queryKey: ['sharedAccountSummaries', idsKey, viewerUid],
    queryFn: async (): Promise<SharedAccountSummary[]> => {
      const input = await Promise.all(
        userHouseholds.map(async (household) => {
          const [entries, members] = await Promise.all([
            sharedBalanceLib.getEntries(household.id),
            authLib.listHouseholdMembers(viewerUid, household.id).catch(() => []),
          ]);
          return { household, entries, members };
        }),
      );
      return summarizeSharedAccounts(input, viewerUid);
    },
    enabled: enabled && userHouseholds.length > 0,
  });
}

export function SharedAccountsPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { userHouseholds, householdId, userProfile, isLoadingHouseholds, switchHousehold, createHousehold } = useAppContext();
  const viewerUid = userProfile!.uid;

  const { data: summaries = [], isLoading } = useSharedAccountSummaries(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const openAccount = async (summary: SharedAccountSummary) => {
    if (switchingId) return;
    setSwitchingId(summary.household.id);
    try {
      if (summary.household.id !== householdId) {
        await switchHousehold(summary.household.id);
      }
      navigate('/shared-balance');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not open this shared account', { variant: 'error' });
    } finally {
      setSwitchingId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await createHousehold(newName.trim());
      enqueueSnackbar('Shared account created', { variant: 'success' });
      setDialogOpen(false);
      setNewName('');
      // The new account becomes the active one server-side.
      navigate('/shared-balance');
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not create the shared account', { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Shared accounts"
        subtitle="Every shared space you belong to — each keeps its own balance, history and approvals."
        action={
          <Button variant="contained" startIcon={<AddIcon fontSize="small" />} onClick={() => setDialogOpen(true)}>
            New shared account
          </Button>
        }
      />

      {isLoadingHouseholds || (isLoading && userHouseholds.length > 0) ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
          {[0, 1].map((item) => <Skeleton key={item} variant="rounded" height={132} />)}
        </Box>
      ) : summaries.length === 0 ? (
        <EmptyLayout
          icon={<SwitchAccountIcon sx={{ fontSize: 28 }} />}
          title="No shared accounts yet"
          description="Create one per shared space — with a partner, a flatmate, a family member. Each stays fully isolated."
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2 }}>
          {summaries.map((summary) => {
            const otherName = summary.members.find((member) => member.uid !== viewerUid)?.displayName ?? 'The other member';
            const balanceCaption = summary.balance > 0
              ? `${otherName} owes you`
              : summary.balance < 0
                ? `You owe ${otherName}`
                : 'All settled up';
            const memberNames = summary.members.map((member) => member.displayName).slice(0, 3).join(', ');
            return (
              <Card
                key={summary.household.id}
                onClick={() => openAccount(summary)}
                sx={{ px: { xs: 2, sm: 2.5 }, py: 2, cursor: switchingId ? 'wait' : 'pointer' }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <SwapHorizIcon color="primary" />
                    <Typography variant="cardTitle" noWrap>{summary.household.name}</Typography>
                  </Stack>
                  {summary.household.id === householdId && <Chip label="Active" color="primary" size="small" />}
                </Stack>
                <Typography variant="cardSubtitle" color="text.secondary" sx={{ mt: 0.5 }}>
                  {memberNames || 'Only you — invite a member from Members & settings'}
                </Typography>
                <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={1} sx={{ mt: 1.5 }}>
                  <Box>
                    <Typography variant="sectionLabel">{balanceCaption}</Typography>
                    <Typography variant="amountValue" color={summary.balance >= 0 ? 'success.main' : 'error.main'}>
                      <Money amount={Math.abs(summary.balance)} code={summary.household.baseCurrency} />
                    </Typography>
                  </Box>
                  {summary.pendingForMe > 0 && (
                    <Chip
                      label={`${summary.pendingForMe} waiting for your approval`}
                      color="secondary"
                      size="small"
                    />
                  )}
                </Stack>
              </Card>
            );
          })}
        </Box>
      )}

      <Dialog open={dialogOpen} onClose={() => !creating && setDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>New shared account</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="normal"
            label="Name"
            placeholder="e.g. Home, Flat 12, Side project"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            helperText="Each shared account is fully isolated — its own members, balance and history."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={creating}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} loading={creating} disabled={!newName.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
