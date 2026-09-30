import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
  alpha
} from '@mui/material';

// Action icons
import { ShoppingCartIcon } from '@/components/AppIcon';
import { CancelIcon } from '@/components/AppIcon';
import { EditIcon } from '@/components/AppIcon';
import { AccountBalanceIcon } from '@/components/AppIcon';
import { CategoryIcon } from '@/components/AppIcon';
import { CalendarMonthIcon } from '@/components/AppIcon';
import { PieChartIcon } from '@/components/AppIcon';
import { SavingsIcon } from '@/components/AppIcon';
import { SyncAltIcon } from '@/components/AppIcon';
import { NotificationsActiveIcon } from '@/components/AppIcon';
import { HomeIcon } from '@/components/AppIcon';
import { HistoryIcon } from '@/components/AppIcon';
import { SearchIcon } from '@/components/AppIcon';

import { PageHeader } from '@/features/shared/components/PageHeader';
import { useAuditLog, useUnreadActivityCount } from '@/hooks/useFinance';
import { useAppContext } from '@/hooks/useAppContext';
import { usePrivacyMask } from '@/hooks/usePrivacyMask';
import { AuditAction, AuditLogEntry } from '@kippa/domain';
import { TransactionIcon } from '@/features/transactions/components/TransactionIcon';
import { EmptyLayout } from '@/features/shared/components/EmptyLayout';
import type activityEn from '@/i18n/locales/en/activity.json';

interface ActionVisual {
  Icon: React.ComponentType<{ sx?: object }>;
  color: string;
  bg: string;
}

/** Maps an audit action to its icon and color treatment. */
function getActionVisual(action: AuditAction, theme: any): ActionVisual {
  switch (action) {
    case 'transaction_created':
      // Could be income/expense/conversion — neutral-ish blue handled per-entry in summary
      return { Icon: ShoppingCartIcon, color: theme.palette.primary.main, bg: alpha(theme.palette.primary.main, 0.10) };
    case 'transaction_updated':
      return { Icon: EditIcon, color: theme.palette.text.secondary, bg: alpha(theme.palette.text.secondary, 0.10) };
    case 'transaction_voided':
      return { Icon: CancelIcon, color: theme.palette.error.main, bg: alpha(theme.palette.error.main, 0.10) };
    case 'account_created':
    case 'account_updated':
      return { Icon: AccountBalanceIcon, color: theme.palette.primary.main, bg: alpha(theme.palette.primary.main, 0.10) };
    case 'category_created':
    case 'category_updated':
      return { Icon: CategoryIcon, color: theme.palette.text.secondary, bg: alpha(theme.palette.text.secondary, 0.10) };
    case 'cycle_created':
    case 'cycle_status_changed':
      return { Icon: CalendarMonthIcon, color: theme.palette.primary.main, bg: alpha(theme.palette.primary.main, 0.10) };
    case 'allocation_saved':
    case 'allocations_batch_saved':
      return { Icon: PieChartIcon, color: theme.palette.text.secondary, bg: alpha(theme.palette.text.secondary, 0.10) };
    case 'expected_income_saved':
      return { Icon: SavingsIcon, color: theme.palette.success.main, bg: alpha(theme.palette.success.main, 0.10) };
    case 'reconciliation_created':
      return { Icon: SyncAltIcon, color: theme.palette.primary.main, bg: alpha(theme.palette.primary.main, 0.10) };
    case 'notification_settings_updated':
      return { Icon: NotificationsActiveIcon, color: theme.palette.text.secondary, bg: alpha(theme.palette.text.secondary, 0.10) };
    case 'household_joined':
    case 'household_left':
      return { Icon: HomeIcon, color: theme.palette.primary.main, bg: alpha(theme.palette.primary.main, 0.10) };
    default:
      return { Icon: HistoryIcon, color: theme.palette.text.secondary, bg: theme.palette.action.hover };
  }
}

/**
 * Groups raw AuditAction values into the filter options shown in the UI.
 * Mirrors the per-case icon mapping in getActionVisual above.
 */
type ActionGroupLabelKey = keyof typeof activityEn['actionGroups'];

/**
 * Groups raw AuditAction values into the filter options shown in the UI.
 * Mirrors the per-case icon mapping in getActionVisual above.
 */
const ACTION_GROUPS: { labelKey: ActionGroupLabelKey; actions: AuditAction[] }[] = [
  { labelKey: 'transactions', actions: ['transaction_created', 'transaction_updated', 'transaction_voided'] },
  { labelKey: 'accounts', actions: ['account_created', 'account_updated'] },
  { labelKey: 'categories', actions: ['category_created', 'category_updated'] },
  { labelKey: 'statements', actions: ['cycle_created', 'cycle_status_changed'] },
  { labelKey: 'allocations', actions: ['allocation_saved', 'allocations_batch_saved', 'expected_income_saved'] },
  { labelKey: 'reconciliation', actions: ['reconciliation_created'] },
  { labelKey: 'spaces', actions: ['household_joined', 'household_left'] },
  { labelKey: 'settings', actions: ['notification_settings_updated'] },
];

/** Compact relative timestamp, e.g. "2m ago", "3h ago", "Just now". */
function relativeTime(iso: string, t: (key: 'time.justNow' | 'time.minutesAgo' | 'time.hoursAgo' | 'time.daysAgo', opts?: { count: number }) => string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return t('time.justNow');
  const min = Math.round(sec / 60);
  if (min < 60) return t('time.minutesAgo', { count: min });
  const hr = Math.round(min / 60);
  if (hr < 24) return t('time.hoursAgo', { count: hr });
  const days = Math.round(hr / 24);
  if (days < 7) return t('time.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const theme = useTheme();
  const { t } = useTranslation('activity');
  const { maskDigits } = usePrivacyMask();
  const { Icon, color, bg } = getActionVisual(entry.action, theme);
  return (
    <TableRow hover>
      <TableCell align="center" sx={{ width: 64, py: 1.25 }}>
        {entry.action === 'transaction_created' ? (
          <TransactionIcon type={entry.details?.type || 'expense'} size={36} />
        ) : (
          <Box
            sx={{
              width: 36,
              height: 36,
              mx: 'auto',
              borderRadius: '50%',
              bgcolor: bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon sx={{ color, fontSize: 20 }} />
          </Box>
        )}
      </TableCell>
      <TableCell sx={{ py: 1.25, minWidth: 0 }}>
        <Typography noWrap sx={{ color: 'text.primary', fontSize: 13.5, fontWeight: 750 }}>
          {maskDigits(entry.summary)}
        </Typography>
        <Typography noWrap sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11 }}>
          {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </Typography>
      </TableCell>
      <TableCell sx={{ width: 220, py: 1.25, display: { xs: 'none', md: 'table-cell' } }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar src={entry.userPhotoURL || undefined} sx={{ width: 24, height: 24, fontSize: 10, bgcolor: 'primary.main' }}>
            {initials(entry.userDisplayName)}
          </Avatar>
          <Typography noWrap sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 600 }}>{entry.userDisplayName}</Typography>
        </Stack>
      </TableCell>
      <TableCell align="right" sx={{ width: { xs: 100, sm: 140 }, py: 1.25 }}>
        <Typography noWrap sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 650 }}>{relativeTime(entry.createdAt, t)}</Typography>
      </TableCell>
    </TableRow>
  );
}

export function AuditLog() {
  const { t } = useTranslation('activity');
  const { householdId, userProfile } = useAppContext();
  const { entries, isLoading } = useAuditLog(householdId, 200);
  const { markSeen } = useUnreadActivityCount(householdId, userProfile?.uid);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedMember, setSelectedMember] = useState('all');

  const handleSearch = (value: string) => { setSearchTerm(value); resetPage(); };
  const handleActionChange = (value: string) => { setSelectedAction(value); resetPage(); };
  const handleMemberChange = (value: string) => { setSelectedMember(value); resetPage(); };

  // Pagination State
  const PAGE_SIZE = 25;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const resetPage = () => setVisibleCount(PAGE_SIZE);

  // Clear the unread badge as soon as the feed is opened.
  useEffect(() => {
    markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Unique members, derived from loaded entries (no extra query needed).
  const members = useMemo(() => {
    const map = new Map<string, { userId: string; userDisplayName: string }>();
    for (const e of entries) {
      if (e.userId && !map.has(e.userId)) {
        map.set(e.userId, { userId: e.userId, userDisplayName: e.userDisplayName });
      }
    }
    return Array.from(map.values());
  }, [entries]);

  // Apply current filters.
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // 1. Text search over summary
      const searchMatch = (entry.summary || '').toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Action group
      let actionMatch = true;
      if (selectedAction !== 'all') {
        const group = ACTION_GROUPS.find((g) => g.labelKey === selectedAction);
        actionMatch = !!group && group.actions.includes(entry.action);
      }

      // 3. Member
      let memberMatch = true;
      if (selectedMember !== 'all') {
        memberMatch = entry.userId === selectedMember;
      }

      return searchMatch && actionMatch && memberMatch;
    });
  }, [entries, searchTerm, selectedAction, selectedMember]);

  const visibleEntries = filteredEntries.slice(0, visibleCount);

  return (
    <Box sx={{ py: 0.5 }}>
      <Stack spacing={3}>
        <PageHeader
          title={t('page.title')}
          subtitle={t('page.subtitle')}
        />

        {isLoading ? (
          <Card>
            <CardContent>
              <Stack divider={<Divider />}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <Stack key={i} direction="row" spacing={1.75} sx={{ py: 1.5, alignItems: 'center' }}>
                    <Skeleton variant="circular" width={38} height={38} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton variant="text" width="85%" height={18} />
                      <Skeleton variant="text" width="40%" height={14} />
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ) : entries.length === 0 ? (
          <Card>
            <EmptyLayout
              icon={<HistoryIcon />}
              title={t('empty.title')}
              description={t('empty.description')}
            />
          </Card>
        ) : (
          <>
            <Stack spacing={1.5}>
              <TextField
                placeholder={t('searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                fullWidth
                slotProps={{
                  input: {
                    startAdornment: <SearchIcon sx={{ color: 'text.secondary', me: 1, fontSize: '20px' }} />,
                  },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: 'surfaceContainerLow',
                    '& fieldset': { borderColor: 'transparent' },
                    '&:hover fieldset': { borderColor: 'transparent' },
                    '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                  },
                }}
              />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
                <FormControl fullWidth>
                  <InputLabel id="activity-action-label">{t('filters.action')}</InputLabel>
                  <Select labelId="activity-action-label" value={selectedAction} label={t('filters.action')} onChange={(e) => handleActionChange(e.target.value)}>
                    <MenuItem value="all">{t('filters.allActions')}</MenuItem>
                    {ACTION_GROUPS.map((g) => <MenuItem key={g.labelKey} value={g.labelKey}>{t(`actionGroups.${g.labelKey}`)}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="activity-member-label">{t('filters.member')}</InputLabel>
                  <Select labelId="activity-member-label" value={selectedMember} label={t('filters.member')} onChange={(e) => handleMemberChange(e.target.value)}>
                    <MenuItem value="all">{t('filters.allMembers')}</MenuItem>
                    {members.map((m) => <MenuItem key={m.userId} value={m.userId}>{m.userDisplayName}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            </Stack>

            <TableContainer component={Card} sx={{ border: 0, boxShadow: 'none', overflow: 'hidden', '&:hover': { transform: 'none', boxShadow: 'none' } }}>
              <Table sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sx={{ width: 64, py: 1.75 }}>{t('table.type')}</TableCell>
                    <TableCell sx={{ py: 1.75 }}>{t('table.activity')}</TableCell>
                    <TableCell sx={{ width: 220, py: 1.75, display: { xs: 'none', md: 'table-cell' } }}>{t('table.member')}</TableCell>
                    <TableCell align="right" sx={{ width: { xs: 100, sm: 140 }, py: 1.75 }}>{t('table.when')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ p: 2, borderBottom: 0 }}>
                        <EmptyLayout
                          icon={<SearchIcon />}
                          title={t('noMatching.title')}
                          description={t('noMatching.description')}
                        />
                      </TableCell>
                    </TableRow>
                  ) : visibleEntries.map(entry => <AuditLogRow key={entry.id} entry={entry} />)}
                </TableBody>
              </Table>
              {visibleCount < filteredEntries.length && (
                <Box sx={{ textAlign: 'center', py: 1.5 }}>
                  <Button size="small" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
                    {t('loadMore', { count: filteredEntries.length - visibleCount })}
                  </Button>
                </Box>
              )}
            </TableContainer>
          </>
        )}
      </Stack>
    </Box>
  );
}
