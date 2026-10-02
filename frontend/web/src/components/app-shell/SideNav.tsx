import { useState } from 'react';
import {
  Box,
  Button,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type appShellEn from '@/i18n/locales/en/appShell.json';
import { useAppContext } from '@/hooks/useAppContext';
import {
  AccountBalanceIcon,
  AddIcon,
  BarChartIcon,
  DashboardIcon,
  ExpandLessIcon,
  ReceiptLongIcon,
  SearchIcon,
  NotesIcon,
  PaymentsIcon,
  SwitchAccountIcon,
} from '@/components/AppIcon';

type NavKey = keyof typeof appShellEn['nav'];
type NavChild = { labelKey: NavKey; path: string };
type NavItem = { labelKey: NavKey; path: string; icon: typeof DashboardIcon; children?: NavChild[] };

const menuItems: NavItem[] = [
  { labelKey: 'dashboard', path: '/', icon: DashboardIcon },
  { labelKey: 'askKip', path: '/ai', icon: NotesIcon },
  { labelKey: 'loans', path: '/loans', icon: PaymentsIcon },
  {
    labelKey: 'analytics',
    path: '/cycles',
    icon: BarChartIcon,
    children: [
      { labelKey: 'statements', path: '/cycles' },
      { labelKey: 'categories', path: '/categories' },
    ],
  },
  {
    labelKey: 'transactions',
    path: '/transactions',
    icon: ReceiptLongIcon,
    children: [
      { labelKey: 'allTransactions', path: '/transactions' },
      { labelKey: 'approvals', path: '/pending' },
      { labelKey: 'expenses', path: '/transactions?type=expense' },
      { labelKey: 'income', path: '/transactions?type=income' },
      { labelKey: 'transfers', path: '/transactions?type=transfer' },
    ],
  },
  {
    labelKey: 'accountsAndCards',
    path: '/accounts',
    icon: AccountBalanceIcon,
    children: [
      { labelKey: 'accountOverview', path: '/accounts' },
      { labelKey: 'reconciliation', path: '/reconciliation' },
    ],
  },
  {
    labelKey: 'spaces',
    path: '/shared-accounts',
    icon: SwitchAccountIcon,
    children: [
      { labelKey: 'allSpaces', path: '/shared-accounts' },
      { labelKey: 'sharedBalance', path: '/shared-balance' },
      { labelKey: 'membersAndSettings', path: '/household' },
      { labelKey: 'notifications', path: '/notifications' },
      { labelKey: 'activityHistory', path: '/activity' },
    ],
  },
];

// Shared-balance-only members can only see the spaces, shared balance,
// and notifications — everything else is blocked by
// the security rules anyway, so showing it would only lead to errors.
const sharedBalanceOnlyMenu: NavItem[] = [
  {
    labelKey: 'spaces',
    path: '/shared-accounts',
    icon: SwitchAccountIcon,
    children: [
      { labelKey: 'allSpaces', path: '/shared-accounts' },
      { labelKey: 'sharedBalance', path: '/shared-balance' },
      { labelKey: 'membersAndSettings', path: '/household' },
      { labelKey: 'notifications', path: '/notifications' },
    ],
  },
];

export function SideNav() {
  const { t } = useTranslation('appShell');
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { userProfile, householdId } = useAppContext();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '/transactions': true });

  const accessLevel = userProfile?.memberships?.[householdId]?.accessLevel ?? 'full';
  const navForLevel = accessLevel === 'sharedBalanceOnly' ? sharedBalanceOnlyMenu : menuItems;

  const matches = (item: NavItem) => {
    const normalizedQuery = query.trim().toLowerCase();
    return t(`nav.${item.labelKey}`).toLowerCase().includes(normalizedQuery)
      || item.children?.some(child => t(`nav.${child.labelKey}`).toLowerCase().includes(normalizedQuery));
  };
  const visibleMenu = navForLevel.filter(matches);

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const label = t(`nav.${item.labelKey}`);
    const active = pathname === item.path || Boolean(item.children?.some(child => pathname === child.path.split('?')[0]));
    const hasChildren = Boolean(item.children?.length);
    const isExpanded = hasChildren && ((expanded[item.path] ?? active) || query.trim().length > 0);
    return (
      <Box key={`${item.labelKey}-${item.path}`}>
        <ListItemButton
          selected={active}
          onClick={() => navigate(item.path)}
          sx={{
            minHeight: 44,
            mb: 0.25,
            px: 1.25,
            borderRadius: '10px',
            color: 'text.primary',
            transition: 'background-color 160ms ease, color 160ms ease',
            '&.Mui-selected': { bgcolor: 'action.selected' },
            '&.Mui-selected:hover': { bgcolor: 'action.selected' },
          }}
        >
          <ListItemIcon sx={{ minWidth: 34, color: active ? 'primary.dark' : 'text.primary' }}>
            <Icon fontSize="small" variant={active ? 'Bold' : 'Linear'} />
          </ListItemIcon>
          <ListItemText primary={label} slotProps={{ primary: { fontSize: 13.5, lineHeight: 1.2, fontWeight: active ? 700 : 500 } }} />
          {hasChildren && (
            <Box
              component="span"
              role="button"
              aria-label={`${isExpanded ? t('sideNav.collapse') : t('sideNav.expand')} ${label}`}
              onClick={event => {
                event.stopPropagation();
                setExpanded(current => ({ ...current, [item.path]: !current[item.path] }));
              }}
              sx={{ p: 0.75, me: -0.75, color: 'text.primary', cursor: 'pointer' }}
            >
              <ExpandLessIcon sx={{ fontSize: 17, transform: isExpanded ? 'none' : 'rotate(180deg)', transition: 'transform 160ms ease' }} />
            </Box>
          )}
        </ListItemButton>

        {isExpanded && item.children && (
          <Stack
            spacing={0.25}
            sx={{
              position: 'relative',
              ms: 2.75,
              mb: 0.75,
              ps: 2.25,
              '&::before': { content: '""', position: 'absolute', top: 2, bottom: 10, insetInlineStart: 0, width: '1px', bgcolor: 'divider' },
            }}
          >
            {item.children.map(child => {
              const childActive = `${pathname}${search}` === child.path;
              return (
                <ListItemButton
                  key={child.path}
                  selected={childActive}
                  onClick={() => navigate(child.path)}
                  sx={{
                    position: 'relative',
                    minHeight: 34,
                    px: 1,
                    py: 0.5,
                    borderRadius: 2,
                    color: 'text.primary',
                    '&::before': { content: '""', position: 'absolute', insetInlineStart: -18, top: '50%', width: 12, height: '1px', bgcolor: 'divider' },
                    '&.Mui-selected': { bgcolor: 'transparent', color: 'primary.main' },
                    '&.Mui-selected:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <ListItemText primary={t(`nav.${child.labelKey}`)} slotProps={{ primary: { fontSize: 12.5, lineHeight: 1.3, fontWeight: childActive ? 700 : 500 } }} />
                </ListItemButton>
              );
            })}
          </Stack>
        )}
      </Box>
    );
  };

  return (
    <Box
      component="aside"
      sx={{
        display: { xs: 'none', md: 'flex' },
        position: 'fixed',
        insetBlock: 0,
        insetInlineStart: 0,
        zIndex: 1200,
        width: 264,
        px: 2,
        py: 2.25,
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderInlineEnd: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 0.5, minHeight: 48, mb: 2.25 }}>
        <Box component="img" src="/icons/icon.svg" alt="Kippa" sx={{ width: 34, height: 34, borderRadius: '9px' }} />
        <Typography sx={{ color: 'text.primary', fontSize: 22, fontWeight: 800, letterSpacing: '-0.045em' }}>Kippa</Typography>
      </Stack>

      <TextField
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={t('sideNav.searchPlaceholder')}
        size="small"
        fullWidth
        slotProps={{
          input: {
            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
          },
        }}
        sx={{
          mb: 2.5,
          '& .MuiOutlinedInput-root': { height: 42, borderRadius: '12px', bgcolor: 'action.hover' },
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
          '& input': { fontSize: '13px !important' },
        }}
      />

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          pe: 0.5,
          me: -0.5,
          scrollbarWidth: 'thin',
          scrollbarColor: 'transparent transparent',
          '&:hover': { scrollbarColor: 'divider transparent' },
        }}
      >
        <Typography sx={{ px: 1.25, mb: 0.75, color: 'text.secondary', fontSize: 11, fontWeight: 650, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {t('sideNav.menu')}
        </Typography>
        <List disablePadding>{visibleMenu.map(renderItem)}</List>
      </Box>

      <Box sx={{ flexShrink: 0, pt: 2 }}>
        <Box sx={{ p: 1.75, borderRadius: '16px', bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
          <Typography sx={{ color: 'text.primary', fontSize: 13, fontWeight: 750 }}>{t('sideNav.recordTitle')}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11, lineHeight: 1.5, mt: 0.5, mb: 1.25 }}>
            {t('sideNav.recordDescription')}
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon fontSize="small" />}
            onClick={() => navigate('/entry')}
            sx={{ minHeight: 36, width: '100%', borderRadius: '9px', px: 1.5, fontSize: 12 }}
          >
            {t('sideNav.quickEntry')}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
