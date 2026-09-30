import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { DashboardData } from '@/libs/selectors';

type CategoryPace = DashboardData['categoryStatus'][number];

export function CategoryPaceChart({ categories }: { categories: CategoryPace[] }) {
  const { t } = useTranslation('dashboard');
  const visible = [...categories]
    .filter(category => category.planned > 0 || category.spent > 0)
    .sort((a, b) => Math.max(b.planned, b.spent) - Math.max(a.planned, a.spent));
  if (!visible.length) return null;

  return <Stack spacing={2}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
      <Box><Typography variant="sectionLabel">{t('pace.title')}</Typography><Typography variant="body2" color="text.secondary">{t('pace.subtitle')}</Typography></Box>
      <Chip label={t('pace.categoriesCount', { count: visible.length })} />
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`, columnGap: { xs: 0.25, sm: 0.75, lg: 1.25 }, alignItems: 'end' }}>
      {visible.map(category => {
          const percent = category.planned > 0 ? (category.spent / category.planned) * 100 : 100;
          const fill = Math.max(category.spent > 0 ? 5 : 0, Math.min(100, percent));
          const over = percent > 100;
          return <Stack key={category.categoryId} spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Tooltip arrow placement="top" title={t('pace.tooltip', { name: category.categoryName, percent: Math.round(percent), spent: category.spent.toLocaleString(), planned: category.planned.toLocaleString() })}>
              <Paper variant="categoryCapacity" sx={{ width: '100%', maxWidth: 46, height: { xs: 72, sm: 88 } }}>
                <Paper variant={over ? 'categoryCapacityOver' : 'categoryCapacitySpent'} sx={{ height: `${fill}%` }} />
              </Paper>
            </Tooltip>
            <Typography variant="loanMeta" color="text.secondary" title={category.categoryName} textAlign="center" noWrap sx={{ width: '100%', minWidth: 0 }}>{category.categoryName}</Typography>
          </Stack>;
        })}
    </Box>
  </Stack>;
}
