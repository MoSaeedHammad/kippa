import {
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type appShellEn from '@/i18n/locales/en/appShell.json';
import { useAppContext } from '@/hooks/useAppContext';
import { AccountBalanceIcon,
  SwapHorizIcon,
} from '@/components/AppIcon';
import { ReceiptLongIcon } from '@/components/AppIcon';
import { SwitchAccountIcon } from '@/components/AppIcon';
import { CategoryIcon } from '@/components/AppIcon';
import { HomeIcon } from '@/components/AppIcon';
import { NotificationsActiveIcon } from '@/components/AppIcon';
import { HistoryIcon } from '@/components/AppIcon';
import { CalendarMonthIcon } from '@/components/AppIcon';
import { SyncAltIcon } from '@/components/AppIcon';
import { PaymentsIcon } from '@/components/AppIcon';

interface QuickNavMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

const menuItemStyle = {
  mx: 1,
  my: 0.25,
  px: 1.5,
  py: 1,
  borderRadius: '8px',
  '&.MuiMenuItem-root': {
    borderRadius: '8px',
  },
  '& .MuiListItemIcon-root': {
    minWidth: 30,
    color: 'text.primary',
  },
  '& .MuiListItemText-primary': {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'text.primary',
  },
  '& .MuiListItemText-secondary': {
    fontSize: '0.75rem',
  },
};

const sectionHeaderStyle = {
  fontWeight: 700,
  color: 'text.secondary',
  textTransform: 'uppercase',
  fontSize: '0.65rem',
  letterSpacing: '0.08em',
  px: 2.5,
  mt: 0.5,
  mb: 0.5,
  display: 'block',
};

type SectionKey = keyof typeof appShellEn['sections'];
type NavKey = keyof typeof appShellEn['nav'];

const FULL_SECTIONS: Array<{ titleKey: SectionKey; items: Array<{ labelKey: NavKey; icon: ReactNode; path: string }> }> = [
  {
    titleKey: 'money',
    items: [
      { labelKey: 'bankAccounts', icon: <AccountBalanceIcon fontSize="small" />, path: '/accounts' },
      { labelKey: 'transactions', icon: <ReceiptLongIcon fontSize="small" />, path: '/transactions' },
      { labelKey: 'categories', icon: <CategoryIcon fontSize="small" />, path: '/categories' },
    ],
  },
  {
    titleKey: 'planning',
    items: [
      { labelKey: 'statements', icon: <CalendarMonthIcon fontSize="small" />, path: '/cycles' },
      { labelKey: 'loans', icon: <PaymentsIcon fontSize="small" />, path: '/loans' },
      { labelKey: 'reconciliation', icon: <SyncAltIcon fontSize="small" />, path: '/reconciliation' },
    ],
  },
  {
    titleKey: 'spaces',
    items: [
      { labelKey: 'allSpaces', icon: <SwitchAccountIcon fontSize="small" />, path: '/shared-accounts' },
      { labelKey: 'sharedBalance', icon: <SwapHorizIcon fontSize="small" />, path: '/shared-balance' },
      { labelKey: 'mySpace', icon: <HomeIcon fontSize="small" />, path: '/household' },
      { labelKey: 'activityLog', icon: <HistoryIcon fontSize="small" />, path: '/activity' },
    ],
  },
  {
    titleKey: 'settings',
    items: [
      { labelKey: 'remindersAndAlerts', icon: <NotificationsActiveIcon fontSize="small" />, path: '/notifications' },
    ],
  },
];

// Shared-balance-only members are blocked from accounts, transactions and
// activity by the rules — surface only what they can actually use.
const SCOPED_SECTIONS: Array<{ titleKey: SectionKey; items: Array<{ labelKey: NavKey; icon: ReactNode; path: string }> }> = [
  {
    titleKey: 'money',
    items: [
      { labelKey: 'sharedBalance', icon: <SwapHorizIcon fontSize="small" />, path: '/shared-balance' },
    ],
  },
  {
    titleKey: 'sharedAccount',
    items: [
      { labelKey: 'mySpace', icon: <HomeIcon fontSize="small" />, path: '/household' },
    ],
  },
  {
    titleKey: 'settings',
    items: [
      { labelKey: 'remindersAndAlerts', icon: <NotificationsActiveIcon fontSize="small" />, path: '/notifications' },
    ],
  },
];

/**
 * Quick navigation menu — anchored to the nav icon button in the TopBar.
 * Surfaces all secondary page destinations (Accounts, Transactions, etc.)
 * so they're one tap away, separate from the settings-heavy profile menu.
 * Styled to match the profile menu: same paper, arrow, borders, sections.
 */
export function QuickNavMenu({ anchorEl, open, onClose }: QuickNavMenuProps) {
  const { t } = useTranslation('appShell');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { userProfile, householdId } = useAppContext();
  const theme = useTheme();
  // Keep the paper caret ('&::before' right: 18, mirrored by the emotion rtl
  // cache) glued to the trigger edge: MUI Menu anchors are physical, so the
  // horizontal origin must flip with direction.
  const menuHorizontal = theme.direction === 'rtl' ? 'left' : 'right';
  const isScoped = userProfile
    ? (userProfile.memberships?.[householdId]?.accessLevel ?? 'full') !== 'full'
    : false;
  const sections = isScoped ? SCOPED_SECTIONS : FULL_SECTIONS;

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Menu
      id="quick-nav-menu"
      anchorEl={anchorEl}
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          elevation: 0,
          sx: {
            overflow: 'visible',
            mt: 1.5,
            minWidth: 280,
            borderRadius: '12px',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 'rgba(0, 0, 0, 0.08) 0px 12px 24px -4px, rgba(0, 0, 0, 0.04) 0px 4px 12px -2px',
            '&::before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 18,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
              borderLeft: '1px solid',
              borderTop: '1px solid',
              borderColor: 'divider',
            },
          },
        },
      }}
      transformOrigin={{ horizontal: menuHorizontal, vertical: 'top' }}
      anchorOrigin={{ horizontal: menuHorizontal, vertical: 'bottom' }}
    >
      {sections.map((section, sIdx) => (
        <div key={section.titleKey}>
          {sIdx > 0 && <Divider sx={{ my: 1 }} />}
          <Typography variant="body2" sx={sectionHeaderStyle}>
            {t(`sections.${section.titleKey}`)}
          </Typography>
          {section.items.map((item) => {
            const isActive = pathname === item.path;
            return (
              <MenuItem
                key={item.path}
                onClick={() => go(item.path)}
                sx={{
                  ...menuItemStyle,
                  ...(isActive && {
                    bgcolor: 'action.selected',
                    '& .MuiListItemIcon-root': { color: 'primary.main' },
                    '& .MuiListItemText-primary': { color: 'primary.main', fontWeight: 600 },
                  }),
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={t(`nav.${item.labelKey}`)} />
              </MenuItem>
            );
          })}
        </div>
      ))}
    </Menu>
  );
}
