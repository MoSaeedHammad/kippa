import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import type { DashboardData } from '@/libs/selectors';

type CategoryPace = DashboardData['categoryStatus'][number];

export function CategoryPaceChart({ categories }: { categories: CategoryPace[] }) {
  const visible = [...categories]
    .filter(category => category.planned > 0 || category.spent > 0)
    .sort((a, b) => Math.max(b.planned, b.spent) - Math.max(a.planned, a.spent));
  if (!visible.length) return null;

  return <Stack spacing={2}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
      <Box><Typography variant="sectionLabel">Category pace</Typography><Typography variant="body2" color="text.secondary">Every category compared by percentage of its plan used.</Typography></Box>
      <Chip label={`${visible.length} categories`} />
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))`, columnGap: { xs: 0.25, sm: 0.75, lg: 1.25 }, alignItems: 'end' }}>
      {visible.map(category => {
          const percent = category.planned > 0 ? (category.spent / category.planned) * 100 : 100;
          const fill = Math.max(category.spent > 0 ? 5 : 0, Math.min(100, percent));
          const over = percent > 100;
          return <Stack key={category.categoryId} spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <Tooltip arrow placement="top" title={`${category.categoryName}: ${Math.round(percent)}% used · ${category.spent.toLocaleString()} spent of ${category.planned.toLocaleString()} planned`}>
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
