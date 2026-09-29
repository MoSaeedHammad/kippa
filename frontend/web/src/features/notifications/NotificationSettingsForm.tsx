import { useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Button,
  Switch,
  Skeleton
} from '@mui/material';
import { NotificationSettings } from '@kippa/domain';
import { useNotifications } from '@/notifications/useNotifications';
import { IosInstallBanner } from '@/notifications/IosInstallBanner';
import { PageHeader } from '@/features/shared/components/PageHeader';
import { CalendarMonthIcon, CreditCardIcon, GroupAddIcon, NotificationsActiveIcon, SyncAltIcon } from '@/components/AppIcon';
import { CardHeading } from '@/features/shared/components/CardHeading';

interface NotificationSettingsFormProps {
  dbSettings: NotificationSettings;
  onSave: (settings: NotificationSettings) => Promise<void>;
  isSaving: boolean;
  /** The user's householdId, used to drive the notification permission flow. */
  householdId: string;
}

export function NotificationSettingsForm({
  dbSettings,
  onSave,
  isSaving,
  householdId
}: NotificationSettingsFormProps) {
  const { enqueueSnackbar } = useSnackbar();
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(dbSettings);
  const { status: notifStatus, requestPermission, disable } = useNotifications(householdId);

  const [permissionActionLoading, setPermissionActionLoading] = useState(false);

  const handleSaveNotifications = async () => {
    await onSave(notifSettings);
    enqueueSnackbar('Notification settings updated!', { variant: 'success' });
  };

  const handleEnableNotifications = async () => {
    setPermissionActionLoading(true);
    try {
      // MUST be a user gesture (button click) — iOS Safari requires this.
      await requestPermission();
      if (Notification.permission === 'granted') {
        enqueueSnackbar('Notifications enabled!', { variant: 'success' });
      }
    } finally {
      setPermissionActionLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setPermissionActionLoading(true);
    try {
      await disable();
      enqueueSnackbar('Notifications disabled', { variant: 'info' });
    } finally {
      setPermissionActionLoading(false);
    }
  };

  const preferences = [
    {
      key: 'dailyReminderEnabled' as const,
      title: 'Daily logging reminder',
      description: 'A gentle prompt to keep your daily records complete.',
      Icon: CalendarMonthIcon,
    },
    {
      key: 'categoryWarningEnabled' as const,
      title: 'Budget warning alerts',
      description: 'Get notified when spending approaches a category limit.',
      Icon: NotificationsActiveIcon,
    },
    {
      key: 'cardExpiryWarningEnabled' as const,
      title: 'Card expiry reminders',
      description: 'Receive an alert before one of your linked cards expires.',
      Icon: CreditCardIcon,
    },
    {
      key: 'joinRequestEnabled' as const,
      title: 'Join requests',
      description: 'Stay informed when a member requests access or a decision is made.',
      Icon: GroupAddIcon,
    },
    {
      key: 'recurringEntriesEnabled' as const,
      title: 'Recurring entry confirmations',
      description: 'Ask me to confirm each recurring shared entry before it counts.',
      Icon: SyncAltIcon,
    },
  ];

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <PageHeader
          title="Reminders & Alerts"
          subtitle="Choose what deserves your attention and how Kippa should reach you."
        />

        {/* Push notification enablement — status + action.
            On iOS the permission prompt must come from a user gesture (click),
            hence the explicit button rather than an auto-prompt. */}
        {notifStatus === 'ios-not-installed' && <IosInstallBanner />}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(300px, 4fr)' }, gap: 3, alignItems: 'start' }}>
          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <CardHeading icon={<NotificationsActiveIcon variant="Bulk" />} title="Alert preferences" subtitle="Only enable the updates that help you act." />
                <Stack divider={<Box sx={{ height: '1px', bgcolor: 'divider' }} />}>
                  {preferences.map(({ key, title, description, Icon }) => (
                    <Stack key={key} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.5 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: 'action.hover', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>{title}</Typography>
                        <Typography sx={{ mt: 0.25, fontSize: 12, lineHeight: 1.5, color: 'text.secondary' }}>{description}</Typography>
                      </Box>
                      <Switch
                        checked={notifSettings[key]}
                        onChange={event => setNotifSettings({ ...notifSettings, [key]: event.target.checked })}
                        slotProps={{ input: { 'aria-label': title } }}
                      />
                    </Stack>
                  ))}
                </Stack>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="contained" onClick={handleSaveNotifications} loading={isSaving} sx={{ minWidth: { xs: '100%', sm: 190 } }}>
                    Save preferences
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 24 } }}>
            <CardContent>
              <Stack spacing={2.5}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width: 44, height: 44, borderRadius: 3, bgcolor: 'action.hover', color: notifStatus === 'enabled' ? 'success.main' : 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <NotificationsActiveIcon />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary' }}>Push delivery</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Device-level notification status</Typography>
                  </Box>
                </Stack>

                {notifStatus === 'checking' ? (
                  <Stack spacing={1}>
                    <Skeleton variant="text" width="75%" height={22} />
                    <Skeleton variant="text" width="100%" height={18} />
                    <Skeleton variant="rounded" width="100%" height={48} />
                  </Stack>
                ) : (
                  <>
                    <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'surfaceContainerLow' }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
                        {notifStatus === 'enabled' ? 'Notifications are enabled' : notifStatus === 'permission-denied' ? 'Notifications are blocked' : notifStatus === 'unsupported' ? 'Push is unavailable here' : 'Notifications are not enabled'}
                      </Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.55, color: 'text.secondary' }}>
                        {notifStatus === 'enabled'
                          ? 'Kippa can send reminders and household updates to this device.'
                          : notifStatus === 'permission-denied'
                            ? 'Allow notifications in your browser or device settings, then reopen Kippa.'
                            : notifStatus === 'unsupported'
                              ? 'On iPhone, add Kippa to your Home Screen on iOS 16.4 or later.'
                              : 'Enable push delivery to receive reminders outside the app.'}
                      </Typography>
                    </Box>
                    {(notifStatus === 'pending' || notifStatus === 'enabled') && (
                      <Button
                        variant={notifStatus === 'enabled' ? 'outlined' : 'contained'}
                        color={notifStatus === 'enabled' ? 'error' : 'primary'}
                        onClick={notifStatus === 'enabled' ? handleDisableNotifications : handleEnableNotifications}
                        loading={permissionActionLoading}
                        fullWidth
                      >
                        {notifStatus === 'enabled' ? 'Disable on this device' : 'Enable notifications'}
                      </Button>
                    )}
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </Box>
  );
}
