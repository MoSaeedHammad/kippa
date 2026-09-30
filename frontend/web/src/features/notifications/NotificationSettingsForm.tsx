import { useState } from 'react';
import { useSnackbar } from 'notistack';
import { useTranslation } from 'react-i18next';
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
import type notificationsEn from '@/i18n/locales/en/notifications.json';

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
  const { t } = useTranslation('notifications');
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(dbSettings);
  const { status: notifStatus, requestPermission, disable } = useNotifications(householdId);

  const [permissionActionLoading, setPermissionActionLoading] = useState(false);

  const handleSaveNotifications = async () => {
    await onSave(notifSettings);
    enqueueSnackbar(t('toasts.settingsUpdated'), { variant: 'success' });
  };

  const handleEnableNotifications = async () => {
    setPermissionActionLoading(true);
    try {
      // MUST be a user gesture (button click) — iOS Safari requires this.
      await requestPermission();
      if (Notification.permission === 'granted') {
        enqueueSnackbar(t('toasts.enabled'), { variant: 'success' });
      }
    } finally {
      setPermissionActionLoading(false);
    }
  };

  const handleDisableNotifications = async () => {
    setPermissionActionLoading(true);
    try {
      await disable();
      enqueueSnackbar(t('toasts.disabled'), { variant: 'info' });
    } finally {
      setPermissionActionLoading(false);
    }
  };

  type PreferenceTitleKey = keyof typeof notificationsEn['preferences'];
  const preferences: { key: keyof NotificationSettings; prefKey: PreferenceTitleKey; Icon: React.ComponentType<{ sx?: object }> }[] = [
    {
      key: 'dailyReminderEnabled',
      prefKey: 'dailyReminder',
      Icon: CalendarMonthIcon,
    },
    {
      key: 'categoryWarningEnabled',
      prefKey: 'categoryWarning',
      Icon: NotificationsActiveIcon,
    },
    {
      key: 'cardExpiryWarningEnabled',
      prefKey: 'cardExpiryWarning',
      Icon: CreditCardIcon,
    },
    {
      key: 'joinRequestEnabled',
      prefKey: 'joinRequest',
      Icon: GroupAddIcon,
    },
    {
      key: 'recurringEntriesEnabled',
      prefKey: 'recurringEntries',
      Icon: SyncAltIcon,
    },
  ];

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <PageHeader
          title={t('page.title')}
          subtitle={t('page.subtitle')}
        />

        {/* Push notification enablement — status + action.
            On iOS the permission prompt must come from a user gesture (click),
            hence the explicit button rather than an auto-prompt. */}
        {notifStatus === 'ios-not-installed' && <IosInstallBanner />}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(300px, 4fr)' }, gap: 3, alignItems: 'start' }}>
          <Card>
            <CardContent>
              <Stack spacing={2.5}>
                <CardHeading icon={<NotificationsActiveIcon variant="Bulk" />} title={t('alertPrefs.title')} subtitle={t('alertPrefs.subtitle')} />
                <Stack divider={<Box sx={{ height: '1px', bgcolor: 'divider' }} />}>
                  {preferences.map(({ key, prefKey, Icon }) => (
                    <Stack key={key} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1.5 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: 'action.hover', color: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>{t(`preferences.${prefKey}.title`)}</Typography>
                        <Typography sx={{ mt: 0.25, fontSize: 12, lineHeight: 1.5, color: 'text.secondary' }}>{t(`preferences.${prefKey}.description`)}</Typography>
                      </Box>
                      <Switch
                        checked={notifSettings[key]}
                        onChange={event => setNotifSettings({ ...notifSettings, [key]: event.target.checked })}
                        slotProps={{ input: { 'aria-label': t(`preferences.${prefKey}.title`) } }}
                      />
                    </Stack>
                  ))}
                </Stack>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="contained" onClick={handleSaveNotifications} loading={isSaving} sx={{ minWidth: { xs: '100%', sm: 190 } }}>
                    {t('alertPrefs.save')}
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
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: 'text.primary' }}>{t('push.title')}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{t('push.subtitle')}</Typography>
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
                        {notifStatus === 'enabled' ? t('push.statusEnabled') : notifStatus === 'permission-denied' ? t('push.statusBlocked') : notifStatus === 'unsupported' ? t('push.statusUnsupported') : t('push.statusDisabled')}
                      </Typography>
                      <Typography sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.55, color: 'text.secondary' }}>
                        {notifStatus === 'enabled'
                          ? t('push.helpEnabled')
                          : notifStatus === 'permission-denied'
                            ? t('push.helpBlocked')
                            : notifStatus === 'unsupported'
                              ? t('push.helpUnsupported')
                              : t('push.helpDisabled')}
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
                        {notifStatus === 'enabled' ? t('push.disableOnDevice') : t('push.enable')}
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
