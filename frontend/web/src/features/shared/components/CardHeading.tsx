import type { ReactNode } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';

/**
 * Shared card/section heading using the canonical icon-badge treatment:
 * a 44×44 secondary-tinted rounded badge (`Paper variant="cardHeaderIcon"`)
 * plus `cardTitle`/`cardSubtitle` typography. Use this for every card and
 * section header so header styling stays consistent across features.
 */
export function CardHeading({ icon, title, subtitle, trailing }: { icon: ReactNode; title: string; subtitle?: string; trailing?: ReactNode }) {
  return <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
      <Paper variant="cardHeaderIcon">{icon}</Paper>
      <Box sx={{ minWidth: 0 }}><Typography variant="cardTitle" noWrap>{title}</Typography>{subtitle && <Typography variant="cardSubtitle" color="text.secondary">{subtitle}</Typography>}</Box>
    </Stack>
    {trailing && <Box sx={{ flexShrink: 0 }}>{trailing}</Box>}
  </Stack>;
}
