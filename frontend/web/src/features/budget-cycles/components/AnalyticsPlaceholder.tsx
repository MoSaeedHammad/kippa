import { Card, CardContent, Skeleton } from '@mui/material';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';

export function AnalyticsPlaceholder({ loading }: { loading: boolean }) {
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
            title="No analytics data yet"
            description="Once you have at least one completed statement with transactions, trends and insights will appear here."
          />
        )}
      </CardContent>
    </Card>
  );
}
