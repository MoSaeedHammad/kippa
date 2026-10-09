import { Box, Pagination, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

type ListPaginationProps = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
};

/**
 * The one pagination control for client-paged lists: MUI page buttons plus a
 * "from–to of total" hint. Render below any list that can exceed one page.
 */
export function ListPagination({ page, pageCount, total, pageSize, onChange }: ListPaginationProps) {
  const { t } = useTranslation('shared');
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, px: { xs: 2, sm: 2.5 }, py: 1.25 }}>
      <Typography variant="fieldHint" color="text.secondary">
        {t('pagination.range', { from, to, total })}
      </Typography>
      <Pagination
        count={pageCount}
        page={page}
        onChange={(_, value) => onChange(value)}
        size="small"
        siblingCount={1}
        sx={{ '& .MuiPaginationItem-root': { mx: 0.5 } }}
      />
    </Box>
  );
}
