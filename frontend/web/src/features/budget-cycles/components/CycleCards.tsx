import { alpha, Box, Button, Card, Chip, LinearProgress, Paper, Stack, Typography, useTheme } from '@mui/material';
import type { BudgetCycle, CurrencyCode } from '@kippa/domain';
import { BarChartIcon, CalendarTodayIcon, CheckCircleOutlineIcon, EditIcon, EventIcon, ExpandLessIcon, TimerIcon } from '@/components/AppIcon';
import { Money } from '@/components/Money';
import { formatCycleDate, type CycleDaysInfo } from '../cycleUtils';

type ActiveCycleCardProps = {
  cycle: BudgetCycle;
  daysInfo: CycleDaysInfo;
  isEditingBudget: boolean;
  onCloseCycle: () => void;
  onToggleBudget: () => void;
};

export function ActiveCycleCard({ cycle, daysInfo, onCloseCycle, isEditingBudget, onToggleBudget }: ActiveCycleCardProps) {
  return (
    <Card sx={{ width: '100%', p: 3, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <Chip
          label="ACTIVE"
          size="small"
          icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }} />}
          sx={{ fontWeight: 700, fontSize: 10, height: 24, borderRadius: 0.75, bgcolor: (theme) => alpha(theme.palette.success.main, 0.08), color: 'success.main', alignSelf: 'flex-start', mb: 1.5, '& .MuiChip-icon': { display: 'block', ml: 1, mr: -0.5 } }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h2" sx={{ fontSize: 24, fontWeight: 800, color: 'text.primary' }}>{cycle.name}</Typography>
            <Box display="flex" alignItems="center" gap={0.75} sx={{ mt: 0.5 }}>
              <EventIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {formatCycleDate(cycle.startDate)}{cycle.endDate ? ` — ${formatCycleDate(cycle.endDate)}` : ' — Ongoing'}
              </Typography>
            </Box>
          </Box>
        </Box>
        {daysInfo.progress !== null ? (
          <Box sx={{ mt: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="body2" color="text.secondary">Day {daysInfo.elapsed} of {daysInfo.total} days total</Typography>
              <Typography variant="body2">{daysInfo.progress}% Elapsed</Typography>
            </Box>
            <LinearProgress variant="determinate" value={daysInfo.progress} color={daysInfo.progress > 85 ? 'warning' : 'primary'} />
          </Box>
        ) : (
          <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimerIcon color="primary" sx={{ fontSize: 16 }} />
            <Typography variant="body2">Day {daysInfo.elapsed + 1} — No end date set</Typography>
          </Box>
        )}
        <Stack direction={{ xs: 'column', sm: 'row', lg: 'column', xl: 'row' }} alignItems="flex-start" spacing={1.5} sx={{ mt: 3.5 }}>
          <Button variant="contained" startIcon={isEditingBudget ? <ExpandLessIcon /> : <EditIcon />} onClick={onToggleBudget}>
            {isEditingBudget ? 'Hide Budget' : 'Edit Budget'}
          </Button>
          <Button variant="outlined" startIcon={<CheckCircleOutlineIcon />} onClick={onCloseCycle}>Close Cycle</Button>
        </Stack>
      </Box>
    </Card>
  );
}

export type CycleHistoryStats = {
  baseCurrency: CurrencyCode;
  plannedBudget?: number;
  actualExpense?: number;
};

type CycleHistoryCardProps = {
  cycle: BudgetCycle;
  isEditing: boolean;
  onToggleBudget: () => void;
  onViewReport?: () => void;
  stats?: CycleHistoryStats;
};

export function CycleHistoryCard({ cycle, isEditing, onToggleBudget, onViewReport, stats }: CycleHistoryCardProps) {
  const theme = useTheme();
  const statusColor = cycle.status === 'open' ? theme.palette.success.main : cycle.status === 'planned' ? theme.palette.primary.main : theme.palette.text.secondary;
  const statusBg = alpha(statusColor, cycle.status === 'closed' ? 0.12 : 0.08);

  const utilization = stats && stats.plannedBudget ? Math.round((stats.actualExpense ?? 0) / stats.plannedBudget * 100) : null;
  const overBudget = utilization !== null && utilization > 100;
  const mode = theme.palette.mode;
  const maxValue = stats ? Math.max(stats.plannedBudget ?? 0, stats.actualExpense ?? 0, 1) : 1;
  const plannedHeight = stats && stats.plannedBudget != null ? Math.max(8, (stats.plannedBudget / maxValue) * 100) : 0;
  const spentHeight = stats && stats.actualExpense != null ? Math.max(8, (stats.actualExpense / maxValue) * 100) : 0;

  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', borderColor: isEditing ? 'primary.main' : undefined }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Paper variant="cardHeaderIcon">
          <CalendarTodayIcon variant="Bulk" />
        </Paper>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="sectionLabel">{cycle.name}</Typography>
          <Typography variant="fieldHint" color="text.secondary" sx={{ mt: 0.25 }}>
            {formatCycleDate(cycle.startDate)}{cycle.endDate ? ` — ${formatCycleDate(cycle.endDate)}` : ''}
          </Typography>
        </Box>
        <Chip label={cycle.status.toUpperCase()} size="small" sx={{ bgcolor: statusBg, color: statusColor }} />
      </Box>

      {stats && (stats.plannedBudget != null || stats.actualExpense != null) && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 1.5, px: 1 }}>
          {[
            { label: 'Planned', height: plannedHeight, value: stats.plannedBudget, color: alpha(theme.palette.primary.main, mode === 'dark' ? 0.45 : 0.4), pct: null as number | null },
            { label: 'Spent', height: spentHeight, value: stats.actualExpense, color: overBudget ? theme.palette.error.main : theme.palette.secondary.main, pct: utilization },
          ].map(bar => (
            <Box key={bar.label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flex: '1 1 0', maxWidth: 80 }}>
              <Box sx={{ width: '100%', height: 72, position: 'relative', borderRadius: '14px 14px 10px 10px', overflow: 'hidden', backgroundImage: `repeating-linear-gradient(135deg, transparent 0 9px, ${alpha(theme.palette.primary.main, mode === 'dark' ? 0.12 : 0.07)} 9px 11px)`, bgcolor: alpha(theme.palette.primary.main, mode === 'dark' ? 0.16 : 0.075) }}>
                <Box sx={{ position: 'absolute', insetInline: 0, bottom: 0, height: `${bar.height}%`, bgcolor: bar.color, borderRadius: '12px 12px 8px 8px', transition: 'height 200ms ease' }} />
              </Box>
              <Typography variant="fieldHint" color="text.secondary" sx={{ textAlign: 'center' }}>{bar.label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'center', lineHeight: 1 }} noWrap>
                {bar.value != null ? <Money amount={bar.value} code={stats.baseCurrency} /> : '—'}
              </Typography>
              {bar.pct != null && (
                <Typography variant="fieldHint" sx={{ fontWeight: 700, textAlign: 'center', color: overBudget ? 'error.main' : 'text.secondary' }} noWrap>
                  {bar.pct}% of plan
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 2 }}>
        {onViewReport && <Button variant="segmented" startIcon={<BarChartIcon />} onClick={onViewReport}>View Report</Button>}
        <Button variant="outlined" startIcon={isEditing ? <ExpandLessIcon /> : <EditIcon />} onClick={onToggleBudget}>
          {isEditing ? 'Hide Budget' : 'Edit Budget'}
        </Button>
      </Stack>
    </Card>
  );
}
