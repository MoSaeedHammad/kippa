import { Alert, AlertTitle, Button, Stack } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { IosShareIcon } from '@/components/AppIcon';

interface Props {
  onClose?: () => void;
}

/**
 * Shown on iOS Safari when the app is not installed to the Home Screen.
 * iOS web push only works from a Home Screen install (iOS 16.4+).
 */
export function IosInstallBanner({ onClose }: Props) {
  const { t } = useTranslation('notifications');
  return (
    <Alert
      severity="info"
      icon={false}
      action={
        onClose ? (
          <Button color="inherit" onClick={onClose}>
            {t('iosBanner.dismiss')}
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{t('iosBanner.title')}</AlertTitle>
      <Stack spacing={1}>
        <span>{t('iosBanner.intro')}</span>
        <span>
          <strong>1.</strong> {t('iosBanner.step1Prefix')}{' '}
          <IosShareIcon fontSize="small" sx={{ verticalAlign: 'middle' }} /> {t('iosBanner.step1Suffix')}
        </span>
        <span>
          <strong>2.</strong> {t('iosBanner.step2Prefix')} <strong>{t('iosBanner.addToHomeScreen')}</strong>.
        </span>
        <span>
          <strong>3.</strong> {t('iosBanner.step3')}
        </span>
        <span style={{ opacity: 0.7, fontSize: '0.85em' }}>{t('iosBanner.requires')}</span>
      </Stack>
    </Alert>
  );
}
