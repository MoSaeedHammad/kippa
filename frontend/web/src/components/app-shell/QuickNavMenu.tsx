import {
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { AccountBalanceIcon } from '@/components/AppIcon';
import { ReceiptLongIcon } from '@/components/AppIcon';
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

const SECTIONS = [
  {
    title: 'Money',
    items: [
      { label: 'Bank Accounts', icon: <AccountBalanceIcon fontSize="small" />, path: '/accounts' },
      { label: 'Transactions', icon: <ReceiptLongIcon fontSize="small" />, path: '/transactions' },
      { label: 'Categories', icon: <CategoryIcon fontSize="small" />, path: '/categories' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Budget Cycles', icon: <CalendarMonthIcon fontSize="small" />, path: '/cycles' },
      { label: 'Loans', icon: <PaymentsIcon fontSize="small" />, path: '/loans' },
      { label: 'Reconciliation', icon: <SyncAltIcon fontSize="small" />, path: '/reconciliation' },
    ],
  },
  {
    title: 'Household',
    items: [
      { label: 'Household Sharing', icon: <HomeIcon fontSize="small" />, path: '/household' },
      { label: 'Activity Log', icon: <HistoryIcon fontSize="small" />, path: '/activity' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Reminders & Alerts', icon: <NotificationsActiveIcon fontSize="small" />, path: '/notifications' },
    ],
  },
] as const;

/**
 * Quick navigation menu — anchored to the nav icon button in the TopBar.
 * Surfaces all secondary page destinations (Accounts, Transactions, etc.)
 * so they're one tap away, separate from the settings-heavy profile menu.
 * Styled to match the profile menu: same paper, arrow, borders, sections.
 */
export function QuickNavMenu({ anchorEl, open, onClose }: QuickNavMenuProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

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
      transformOrigin={{ horizontal: 'right', vertical: 'top' }}
      anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
    >
      {SECTIONS.map((section, sIdx) => (
        <div key={section.title}>
          {sIdx > 0 && <Divider sx={{ my: 1 }} />}
          <Typography variant="body2" sx={sectionHeaderStyle}>
            {section.title}
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
                <ListItemText primary={item.label} />
              </MenuItem>
            );
          })}
        </div>
      ))}
    </Menu>
  );
}
