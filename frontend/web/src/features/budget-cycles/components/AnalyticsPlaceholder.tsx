import { Card, CardContent, Skeleton } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';

export function AnalyticsPlaceholder({ loading }: { loading: boolean }) {
  const { t } = useTranslation('budgetCycles');
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        {loading ? (
          <>
            <Skeleton variant="text" width="40%" height={28} animation="wave" />
            <Skeleton variant="rectangular" width="100%" height={200} sx={{ mt: 2 }} animation="wave" />
          </>
        ) : (
          <EmptyLayout
            title={t('analyticsPlaceholder.title')}
            description={t('analyticsPlaceholder.description')}
          />
        )}
      </CardContent>
    </Card>
  );
}
