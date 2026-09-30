import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('household');
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
    enqueueSnackbar(t('toasts.inviteIdCopied'), { variant: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyInviteLink = (id: string) => {
    const link = `${window.location.origin}/join?invite=${id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    enqueueSnackbar(t('toasts.inviteLinkCopied'), { variant: 'success' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSwitchHousehold = async (id: string) => {
    setActionLoading(true);
    try {
      await switchHousehold(id);
      enqueueSnackbar(t('toasts.switched'), { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || t('toasts.switchFailed'), { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateHousehold = async () => {
    if (!newHouseholdName.trim()) {
      enqueueSnackbar(t('toasts.nameRequired'), { variant: 'warning' });
      return;
    }
    setActionLoading(true);
    try {
      const newHh = await createHousehold(newHouseholdName.trim());
      setNewHouseholdName('');
      enqueueSnackbar(t('toasts.created', { name: newHh.name }), { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || t('toasts.createFailed'), { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinHousehold = async () => {
    if (!householdIdToJoin.trim()) {
      enqueueSnackbar(t('toasts.inviteIdRequired'), { variant: 'warning' });
      return;
    }
    setActionLoading(true);
    try {
      await requestToJoinHousehold(householdIdToJoin.trim());
      enqueueSnackbar(t('toasts.requestSent'), { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || t('toasts.requestJoinFailed'), { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecide = async (requesterUid: string, decision: 'approve' | 'reject', accessLevel?: AccessLevel) => {
    if (!householdId) return;
    setActionLoading(true);
    try {
      await decideJoinRequest(householdId, requesterUid, decision, accessLevel);
      enqueueSnackbar(decision === 'approve' ? t('toasts.requestApproved') : t('toasts.requestRejected'), { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || t('toasts.decideFailed'), { variant: 'error' });
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
          ? t('toasts.nowFullAccess')
          : t('toasts.nowSharedOnly'),
        { variant: 'success' },
      );
    } catch (err: any) {
      enqueueSnackbar(err.message || t('toasts.accessLevelFailed'), { variant: 'error' });
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
      enqueueSnackbar(t('toasts.leftSpace', { name: householdToLeave.name }), { variant: 'success' });
      handleCloseLeaveConfirm();
    } catch (err: any) {
      enqueueSnackbar(err.message || t('toasts.leaveFailed'), { variant: 'error' });
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
      enqueueSnackbar(t('toasts.baseCurrencyUpdated', { currency: newCurrency }), { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err?.message || t('toasts.baseCurrencyFailed'), { variant: 'error' });
    } finally {
      setBaseCurrencyLoading(false);
    }
  };

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <PageHeader
          title={t('page.title')}
          subtitle={t('page.subtitle')}
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
                  subtitle={`${activeHh.baseCurrency} (${t('spotlight.baseCurrencyTag')}) • ${userProfile!.role === 'owner' ? t('roles.owner') : t('roles.member')}`}
                  trailing={
                    <Chip
                      label={t('spotlight.active')}
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
                    {t('spotlight.baseCurrencyLabel')}
                  </Typography>
                  <CurrencySelect
                    labelId="hh-base-currency-label"
                    value={activeHh.baseCurrency}
                    onChange={handleBaseCurrencyChange}
                  />
                  {baseCurrencyLoading && (
                    <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}>
                      {t('spotlight.saving')}
                    </Typography>
                  )}
                </Box>

                <Divider />

                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {t('spotlight.inviteHeading')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '11px' }}>
                    {t('spotlight.inviteHelp')}
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
                      {t('spotlight.inviteLinkCaption')}
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => handleCopyInviteLink(activeHh.id)}
                      startIcon={copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                      color={copied ? "success" : "primary"}
                      sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}
                    >
                      {copied ? t('spotlight.copied') : t('spotlight.copyInviteLink')}
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
                      {t('spotlight.copyId')}
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
                  <CardHeading icon={<GroupAddIcon variant="Bulk" />} title={t('manageCard.title')} subtitle={t('manageCard.subtitle')} />
                </CardContent>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <Tabs value={tabValue} onChange={(_, val) => setTabValue(val)} variant="fullWidth">
                    <Tab icon={<AddHomeIcon sx={{ fontSize: '18px' }} />} iconPosition="start" label={t('manageCard.createTab')} />
                    <Tab icon={<GroupAddIcon sx={{ fontSize: '18px' }} />} iconPosition="start" label={t('manageCard.joinTab')} />
                  </Tabs>
                </Box>
                <CardContent>
                  {tabValue === 0 && (
                    <Stack spacing={2}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '12px' }}>
                        {t('manageCard.createHelp')}
                      </Typography>
                      <TextField
                        fullWidth
                        label={t('manageCard.nameLabel')}
                        placeholder={t('manageCard.namePlaceholder')}
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
                        {t('manageCard.createButton')}
                      </Button>
                    </Stack>
                  )}
                  {tabValue === 1 && (
                    <Stack spacing={2}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '12px' }}>
                        {t('manageCard.joinHelp')}
                      </Typography>
                      <TextField
                        fullWidth
                        label={t('manageCard.inviteIdLabel')}
                        placeholder={t('manageCard.inviteIdPlaceholder')}
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
                          {t('manageCard.requestToJoin')}
                        </Button>
                      )}
                      {outgoingStatus === 'pending' && (
                        <Alert severity="info" icon={<HourglassEmptyIcon />}>
                          {t('manageCard.requestPending')}
                        </Alert>
                      )}
                      {outgoingStatus === 'rejected' && (
                        <>
                          <Alert severity="error">
                            {t('manageCard.requestDeclined')}
                          </Alert>
                          <Button
                            fullWidth
                            variant="outlined"
                            onClick={handleJoinHousehold}
                            disabled={actionLoading}
                          >
                            {t('manageCard.requestAgain')}
                          </Button>
                        </>
                      )}
                      {outgoingStatus === 'approved' && (
                        <>
                          <Alert severity="success" icon={<CheckCircleIcon />}>
                            {t('manageCard.approved')}
                          </Alert>
                          <Button
                            fullWidth
                            variant="contained"
                            onClick={() => handleSwitchHousehold(householdIdToJoin.trim())}
                            disabled={householdIdToJoin.trim() === householdId || actionLoading}
                          >
                            {t('manageCard.switchToAccount')}
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
