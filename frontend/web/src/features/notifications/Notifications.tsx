import { 
  Box, 
  Stack, 
  Skeleton
} from '@mui/material';
import { 
  useNotificationSettings, 
  useUpdateNotificationSettingsMutation 
} from '@/hooks/useFinance';
import { NotificationSettings } from '@kippa/domain';
import { NotificationSettingsForm } from '@/features/notifications/NotificationSettingsForm';
import { useAppContext } from '@/hooks/useAppContext';

export function Notifications() {
  const { householdId, userProfile } = useAppContext();
  const userId = userProfile?.uid || '';

  const { data: dbSettings, isLoading } = useNotificationSettings(householdId, userId);
  const updateSettingsMutation = useUpdateNotificationSettingsMutation();

  const handleSave = async (settings: NotificationSettings) => {
    await updateSettingsMutation.mutateAsync({
      householdId,
      userId,
      settings
    });
  };

  if (isLoading) {
    return (
      <Box sx={{ py: 0.5 }}>
        <Stack spacing={3}>
          <Box sx={{ mt: 1 }}>
            <Skeleton variant="text" width="60%" height={32} />
            <Skeleton variant="text" width="40%" height={20} />
          </Box>
          <Skeleton variant="rectangular" width="100%" height={200} sx={{ borderRadius: '20px' }} />
        </Stack>
      </Box>
    );
  }

  const defaultSettings: NotificationSettings = dbSettings || {
    userId,
    householdId,
    dailyReminderEnabled: true,
    categoryWarningEnabled: true,
    cardExpiryWarningEnabled: true,
    joinRequestEnabled: true,
    recurringEntriesEnabled: true,
  };

  return (
    <NotificationSettingsForm
      key={dbSettings ? `${dbSettings.userId}-${dbSettings.householdId}` : 'loading'}
      dbSettings={defaultSettings}
      onSave={handleSave}
      isSaving={updateSettingsMutation.isPending}
      householdId={householdId}
    />
  );
}
