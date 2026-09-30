import { IconButton, Badge, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { NotificationsIcon } from '@/components/AppIcon';

import { useUnreadActivityCount } from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';

interface ActivityBellProps {
  onClick: () => void;
}

/**
 * Bell icon for the top AppBar. Shows a badge with the number of audit log
 * entries created by OTHER household members since the current user last
 * opened the activity feed.
 */
export function ActivityBell({ onClick }: ActivityBellProps) {
  const { t } = useTranslation('activity');
  const { userProfile, householdId } = useAppContext();
  const { unreadCount } = useUnreadActivityCount(householdId, userProfile?.uid);

  const label = unreadCount > 0 ? t('bell.newActivity', { count: unreadCount }) : t('bell.noActivity');

  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        onClick={onClick}
        sx={{ p: 0.5, width: 40, height: 40, border: '1px solid', borderColor: 'divider' }}
      >
        <Badge badgeContent={unreadCount} color="error">
          <NotificationsIcon sx={{ color: 'primary.main' }} />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}
