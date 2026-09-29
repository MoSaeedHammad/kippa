import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Button,
  Divider,
  TextField,
  Chip,
  Grid,
  Tabs,
  Tab,
  Alert
} from '@mui/material';
import { ContentCopyIcon } from '@/components/AppIcon';
import { HomeIcon } from '@/components/AppIcon';
import { AddHomeIcon } from '@/components/AppIcon';
import { GroupAddIcon } from '@/components/AppIcon';
import { CheckCircleIcon } from '@/components/AppIcon';
import { CheckIcon } from '@/components/AppIcon';
import { HourglassEmptyIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';

import type { Household, CurrencyCode, AccessLevel } from '@kippa/domain';
import { useAppContext } from '@/hooks/useAppContext';
import { CurrencySelect } from '@/features/shared/components/CurrencySelect';
import { ledgerLib } from '@/libs/ledger';
import { authLib } from '@/libs/auth';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { HouseholdMembersCard } from './components/HouseholdMembersCard';
import { YourHouseholdsCard } from './components/YourHouseholdsCard';
import { LeaveHouseholdDialog } from './components/LeaveHouseholdDialog';
import { useJoinRequestStatus } from './hooks/useJoinRequestStatus';
import { useHouseholdUi } from './hooks/useHouseholdUi';

export function Household() {
  const { enqueueSnackbar } = useSnackbar();
  const {
    userProfile,
    householdId,
    userHouseholds: householdsList,
    isLoadingHouseholds: householdsLoading,
    switchHousehold,
    createHousehold,
    requestToJoinHousehold,
    decideJoinRequest,
    leaveHousehold,
    pendingRequests,
    householdMembers,
    isMembersLoading,
  } = useAppContext();

  const { actionLoading, baseCurrencyLoading, copied, householdIdToJoin, householdToLeave, newHouseholdName, setActionLoading, setBaseCurrencyLoading, setCopied, setHouseholdIdToJoin, setHouseholdToLeave, setNewHouseholdName, setTabValue, tabValue } = useHouseholdUi();
  const queryClient = useQueryClient();

  const handleCopyHouseholdId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    enqueueSnackbar('Invite ID copied to clipboard!', { variant: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyInviteLink = (id: string) => {
    const link = `${window.location.origin}/join?invite=${id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    enqueueSnackbar('Invite link copied — they sign in and request to join; you pick their access level.', { variant: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwitchHousehold = async (id: string) => {
    setActionLoading(true);
    try {
      await switchHousehold(id);
      enqueueSnackbar('Switched space successfully!', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to switch space.', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateHousehold = async () => {
    if (!newHouseholdName.trim()) {
      enqueueSnackbar('Please enter a space name', { variant: 'warning' });
      return;
    }
    setActionLoading(true);
    try {
      const newHh = await createHousehold(newHouseholdName.trim());
      setNewHouseholdName('');
      enqueueSnackbar(`Shared account "${newHh.name}" created and set as active!`, { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to create space', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinHousehold = async () => {
    if (!householdIdToJoin.trim()) {
      enqueueSnackbar('Please enter a valid Invite ID', { variant: 'warning' });
      return;
    }
    setActionLoading(true);
    try {
      await requestToJoinHousehold(householdIdToJoin.trim());
      enqueueSnackbar('Request sent — the space owner will review it.', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to request join. Make sure the ID is correct.', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecide = async (requesterUid: string, decision: 'approve' | 'reject', accessLevel?: AccessLevel) => {
    if (!householdId) return;
    setActionLoading(true);
    try {
      await decideJoinRequest(householdId, requesterUid, decision, accessLevel);
      enqueueSnackbar(decision === 'approve' ? 'Request approved.' : 'Request rejected.', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to decide request.', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAccessLevelChange = async (memberUid: string, accessLevel: AccessLevel) => {
    if (!householdId) return;
    setActionLoading(true);
    try {
      await authLib.updateMemberAccessLevel(householdId, memberUid, accessLevel);
      await queryClient.invalidateQueries({ queryKey: ['householdMembers', householdId] });
      enqueueSnackbar(
        accessLevel === 'full'
          ? 'Member now has full access.'
          : 'Member now sees the shared balance only.',
        { variant: 'success' },
      );
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to update access level.', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenLeaveConfirm = (hh: Household) => {
    setHouseholdToLeave(hh);
  };

  const handleCloseLeaveConfirm = () => {
    setHouseholdToLeave(null);
  };

  const handleLeaveHousehold = async () => {
    if (!householdToLeave) return;
    setActionLoading(true);
    try {
      await leaveHousehold(householdToLeave.id);
      enqueueSnackbar(`Successfully left space "${householdToLeave.name}"`, { variant: 'success' });
      handleCloseLeaveConfirm();
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to leave space.', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  // Find active household info
  const activeHh = householdsList.find(h => h.id === householdId);
  const isOwner = activeHh ? activeHh.createdBy === userProfile?.uid : false;

  // Outgoing request status for the id currently in the join box.
  const outgoingStatus = useJoinRequestStatus(householdIdToJoin, userProfile?.uid);

  const handleBaseCurrencyChange = async (newCurrency: CurrencyCode) => {
    if (!activeHh || newCurrency === activeHh.baseCurrency) return;
    setBaseCurrencyLoading(true);
    try {
      await ledgerLib.updateHouseholdBaseCurrency(householdId, newCurrency);
      await queryClient.invalidateQueries({ queryKey: ['userHouseholds'] });
      enqueueSnackbar(`Base currency updated to ${newCurrency}`, { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err?.message || 'Failed to update base currency', { variant: 'error' });
    } finally {
      setBaseCurrencyLoading(false);
    }
  };

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <PageHeader
          title="My space"
          subtitle="Manage members, shared access, and the spaces you belong to."
        />

        <Grid container spacing={3} alignItems="stretch">
        {/* Current Household Spotlight */}
        {activeHh && (
          <Grid size={{ xs: 12, lg: isOwner ? 7 : 12 }}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Stack spacing={2.5}>
                <CardHeading
                  icon={<HomeIcon variant="Bulk" />}
                  title={activeHh.name}
                  subtitle={`${activeHh.baseCurrency} (Base Currency) • ${userProfile!.role === 'owner' ? 'Owner' : 'Member'}`}
                  trailing={
                    <Chip
                      label="Active"
                      color="primary"
                      size="small"
                      icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                      sx={{ fontWeight: 700 }}
                    />
                  }
                />

                {/* Base Currency Setting */}
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    Base Currency
                  </Typography>
                  <CurrencySelect
                    labelId="hh-base-currency-label"
                    value={activeHh.baseCurrency}
                    onChange={handleBaseCurrencyChange}
                  />
                  {baseCurrencyLoading && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                      Saving…
                    </Typography>
                  )}
                </Box>

                <Divider />

                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Invite
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '11px' }}>
                    Share the link and they request to join — you pick what they can see (Full or Shared balance only) when approving.
                  </Typography>
                  <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    bgcolor: 'surfaceContainerLow',
                    p: 1.5,
                    borderRadius: 3,
                    gap: 1
                  }}>
                    <Typography variant="caption" sx={{ color: 'text.primary', py: 0.5 }}>
                      Invite link — opens the join screen with this shared account pre-filled
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleCopyInviteLink(activeHh.id)}
                      startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                      color={copied ? "success" : "primary"}
                      sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                    >
                      {copied ? "Copied!" : "Copy invite link"}
                    </Button>
                  </Box>
                  <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between',
                    bgcolor: 'surfaceContainerLow',
                    p: 1.5,
                    borderRadius: 3,
                    gap: 1
                  }}>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '13px', color: 'text.primary', userSelect: 'all', wordBreak: 'break-all', py: 0.5 }}>
                      {activeHh.id}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleCopyHouseholdId(activeHh.id)}
                      startIcon={<ContentCopyIcon fontSize="small" />}
                      color="primary"
                      sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                    >
                      Copy ID
                    </Button>
                  </Box>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
          </Grid>
        )}

        {/* Members + Pending Requests — owner only */}
        {isOwner && (
          <Grid size={{ xs: 12, lg: 5 }}>
          <HouseholdMembersCard
            busy={actionLoading}
            loading={isMembersLoading}
            members={householdMembers}
            onDecide={handleDecide}
            onAccessLevelChange={handleAccessLevelChange}
            requests={pendingRequests}
          />
          </Grid>
        )}
        </Grid>

        <Grid container spacing={3}>
          {/* Left Column: Your Households List */}
          <Grid size={{ xs: 12, md: 6 }}>
              <YourHouseholdsCard activeId={householdId} busy={actionLoading} households={householdsList} loading={householdsLoading} onLeave={handleOpenLeaveConfirm} onSwitch={handleSwitchHousehold} />
          </Grid>

          {/* Right Column: Create & Join Actions (Tabbed Panel) */}
          <Grid size={{ xs: 12, md: 6 }}>
              <Card>
                <CardContent>
                  <CardHeading icon={<GroupAddIcon variant="Bulk" />} title="Manage shared accounts" subtitle="Create a new space or join someone else's." />
                </CardContent>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <Tabs value={tabValue} onChange={(_, val) => setTabValue(val)} variant="fullWidth">
                    <Tab icon={<AddHomeIcon sx={{ fontSize: '18px' }} />} iconPosition="start" label="Create" />
                    <Tab icon={<GroupAddIcon sx={{ fontSize: '18px' }} />} iconPosition="start" label="Join" />
                  </Tabs>
                </Box>
                <CardContent>
                  {tabValue === 0 && (
                    <Stack spacing={2}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '12px' }}>
                        Start a separate, brand-new shared account database container.
                      </Typography>
                      <TextField
                        fullWidth
                        label="Shared account name"
                        placeholder="e.g. Vacation home"
                        value={newHouseholdName}
                        onChange={e => setNewHouseholdName(e.target.value)}
                        disabled={actionLoading}
                      />
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={handleCreateHousehold}
                        disabled={actionLoading}
                      >
                        Create
                      </Button>
                    </Stack>
                  )}
                  {tabValue === 1 && (
                    <Stack spacing={2}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '12px' }}>
                        Paste an Invite ID from a shared account owner. They'll need to approve your request before you can join.
                      </Typography>
                      <TextField
                        fullWidth
                        label="Invite ID"
                        placeholder="Paste UUID here"
                        value={householdIdToJoin}
                        onChange={e => setHouseholdIdToJoin(e.target.value)}
                        disabled={actionLoading}
                      />
                      {outgoingStatus === null && (
                        <Button
                          fullWidth
                          variant="outlined"
                          onClick={handleJoinHousehold}
                          disabled={actionLoading}
                        >
                          Request to Join
                        </Button>
                      )}
                      {outgoingStatus === 'pending' && (
                        <Alert severity="info" icon={<HourglassEmptyIcon />}>
                          Request pending — waiting for the owner to approve.
                        </Alert>
                      )}
                      {outgoingStatus === 'rejected' && (
                        <>
                          <Alert severity="error">
                            Your request was declined by the owner.
                          </Alert>
                          <Button
                            fullWidth
                            variant="outlined"
                            onClick={handleJoinHousehold}
                            disabled={actionLoading}
                          >
                            Request Again
                          </Button>
                        </>
                      )}
                      {outgoingStatus === 'approved' && (
                        <>
                          <Alert severity="success" icon={<CheckCircleIcon />}>
                            You're approved!
                          </Alert>
                          <Button
                            fullWidth
                            variant="contained"
                            onClick={() => handleSwitchHousehold(householdIdToJoin.trim())}
                            disabled={householdIdToJoin.trim() === householdId || actionLoading}
                          >
                            Switch to this shared account
                          </Button>
                        </>
                      )}
                    </Stack>
                  )}
                </CardContent>
              </Card>
          </Grid>
        </Grid>
      </Stack>

      <LeaveHouseholdDialog busy={actionLoading} household={householdToLeave} onClose={handleCloseLeaveConfirm} onConfirm={handleLeaveHousehold} />
    </Box>
  );
}
