import { useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import type { SharedBalanceEntry } from '@kippa/domain';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import { SwapHorizIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { computeSharedBalance } from '@/libs/sharedBalance';
import { useAppContext } from '@/hooks/useAppContext';
import {
  useDecideSharedBalanceEntryMutation,
  useEditSharedBalanceEntryMutation,
  useProposeSharedBalanceEntryMutation,
  useSharedBalanceEntries,
  useSharedBalanceMembers,
} from './hooks/useSharedBalance';
import { AddSharedBalanceEntryDialog } from './components/AddSharedBalanceEntryDialog';
import { SharedBalanceEntryItem } from './components/SharedBalanceEntryItem';

export function SharedBalancePage() {
  const { householdId, userProfile, userHouseholds } = useAppContext();
  const { enqueueSnackbar } = useSnackbar();
  const viewerUid = userProfile!.uid;
  const baseCurrency = userHouseholds.find((h) => h.id === householdId)?.baseCurrency ?? 'EGP';

  const { data: entries = [], isLoading } = useSharedBalanceEntries(householdId);
  const { data: members = [] } = useSharedBalanceMembers(householdId);
  const proposeMutation = useProposeSharedBalanceEntryMutation();
  const decideMutation = useDecideSharedBalanceEntryMutation();
  const editMutation = useEditSharedBalanceEntryMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SharedBalanceEntry | null>(null);

  const balance = computeSharedBalance(entries, viewerUid);
  const pendingForViewer = entries.filter(
    (entry) => entry.status === 'pending' && entry.createdBy !== viewerUid,
  ).length;
  const busy = proposeMutation.isPending || decideMutation.isPending || editMutation.isPending;

  const otherName = members.find((member) => member.uid !== viewerUid)?.displayName;
  const balanceCaption = balance > 0
    ? `${otherName ?? 'The other member'} owes you`
    : balance < 0
      ? `You owe ${otherName ?? 'the other member'}`
      : 'All settled up';

  const closeDialog = () => {
    if (busy) return;
    setDialogOpen(false);
    setEditingEntry(null);
  };

  const handlePropose = async (input: Parameters<typeof proposeMutation.mutateAsync>[0]) => {
    try {
      await proposeMutation.mutateAsync({ householdId, ...input });
      enqueueSnackbar('Entry sent for approval', { variant: 'success' });
      setDialogOpen(false);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not add this entry', { variant: 'error' });
    }
  };

  const handleEditSubmit = async (input: { amount: number; typeLabel: string; note: string | null; date: string }) => {
    if (!editingEntry) return;
    try {
      await editMutation.mutateAsync({ householdId, entryId: editingEntry.id, ...input });
      enqueueSnackbar('Entry updated — waiting for approval again', { variant: 'success' });
      setDialogOpen(false);
      setEditingEntry(null);
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not update this entry', { variant: 'error' });
    }
  };

  const decide = async (entry: SharedBalanceEntry, action: 'approve' | 'reject' | 'cancel') => {
    try {
      await decideMutation.mutateAsync({ householdId, entryId: entry.id, action });
      enqueueSnackbar(
        action === 'approve' ? 'Entry approved' : action === 'reject' ? 'Entry declined' : 'Entry cancelled',
        { variant: 'success' },
      );
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Could not update this entry', { variant: 'error' });
    }
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        title="Shared balance"
        subtitle="IOUs, splits and repayments between you and another member. Nothing counts until the other side approves."
        action={
          <Button
            variant="contained"
            onClick={() => { setEditingEntry(null); setDialogOpen(true); }}
          >
            Add entry
          </Button>
        }
      />

      <Card sx={{ px: { xs: 2, sm: 2.5 }, py: 2, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <SwapHorizIcon color="primary" />
          <Box>
            <Typography variant="sectionLabel">{balanceCaption}</Typography>
            <Typography variant="cardSubtitle" color="text.secondary">
              Positive means you are owed; negative means you owe.
            </Typography>
          </Box>
        </Stack>
        <Typography variant="amountValue" color={balance >= 0 ? 'success.main' : 'error.main'}>
          <Money amount={Math.abs(balance)} code={baseCurrency} />
        </Typography>
      </Card>

      {pendingForViewer > 0 && (
        <Chip
          label={`${pendingForViewer} ${pendingForViewer === 1 ? 'entry waits' : 'entries wait'} for your approval`}
          color="secondary"
          sx={{ alignSelf: 'flex-start' }}
        />
      )}

      {isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((item) => <Skeleton key={item} variant="rounded" height={76} />)}
        </Stack>
      ) : entries.length === 0 ? (
        <EmptyLayout
          icon={<SwapHorizIcon sx={{ fontSize: 28 }} />}
          title="No shared entries yet"
          description="Add an IOU, split or repayment — the other member approves it before it changes the balance."
        />
      ) : (
        <Card sx={{ overflow: 'hidden', '&:hover': { transform: 'none' } }}>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
            <Typography variant="cardTitle">Entries</Typography>
            <Typography variant="cardSubtitle" color="text.secondary">
              Newest first — pending entries sit on top
            </Typography>
          </Box>
          <Divider />
          {entries.map((entry) => (
            <SharedBalanceEntryItem
              key={`${entry.id}_r${entry.revision}`}
              entry={entry}
              viewerUid={viewerUid}
              busy={busy}
              onApprove={(item) => decide(item, 'approve')}
              onReject={(item) => decide(item, 'reject')}
              onCancel={(item) => decide(item, 'cancel')}
              onEdit={(item) => { setEditingEntry(item); setDialogOpen(true); }}
            />
          ))}
        </Card>
      )}

      <AddSharedBalanceEntryDialog
        open={dialogOpen}
        busy={busy}
        entry={editingEntry}
        members={members}
        viewerUid={viewerUid}
        defaultCurrency={baseCurrency}
        onClose={closeDialog}
        onSubmit={handlePropose}
        onEditSubmit={handleEditSubmit}
      />
    </Stack>
  );
}
