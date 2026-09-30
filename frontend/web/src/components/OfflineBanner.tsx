import { AppBar, Toolbar, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CloudOffIcon } from '@/components/AppIcon';

export interface OfflineBannerProps {
  isOnline: boolean;
}

/**
 * Slim banner pinned at the top of the app shell when the device is offline.
 * Auto-dismisses on reconnect (driven by the parent's `isOnline` prop).
 */
export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  const { t } = useTranslation('appShell');
  if (isOnline) return null;
  return (
    <AppBar
      position="sticky"
      color="warning"
      elevation={0}
      sx={{ top: 0 }}
    >
      <Toolbar variant="dense" sx={{ justifyContent: 'center', gap: 1, minHeight: '40px !important' }}>
        <CloudOffIcon fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t('offlineBanner.message')}
        </Typography>
      </Toolbar>
    </AppBar>
  );
}
