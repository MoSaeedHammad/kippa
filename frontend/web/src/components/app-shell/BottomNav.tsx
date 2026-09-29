import { Paper, Box, Typography, useTheme, alpha, Badge } from '@mui/material';
import { DashboardIcon } from '@/components/AppIcon';
import { NotesIcon } from '@/components/AppIcon';
import { ReceiptLongIcon } from '@/components/AppIcon';
import { AddIcon } from '@/components/AppIcon';
import { HourglassEmptyIcon } from '@/components/AppIcon';
import { SwitchAccountIcon } from '@/components/AppIcon';
import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { usePendingFinancialMessages } from '@/hooks/useFinance';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const LEFT_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: <DashboardIcon /> },
  { label: 'Kip', path: '/ai', icon: <NotesIcon /> },
];

const RIGHT_ITEMS: NavItem[] = [
  { label: 'Transactions', path: '/transactions', icon: <ReceiptLongIcon /> },
  { label: 'Pending', path: '/pending', icon: <HourglassEmptyIcon /> },
];

// Shared-balance-only members are blocked from everything else by the rules.
const SCOPED_LEFT_ITEMS: NavItem[] = [
  { label: 'Spaces', path: '/shared-accounts', icon: <SwitchAccountIcon /> },
];
const SCOPED_RIGHT_ITEMS: NavItem[] = [
  { label: 'My space', path: '/household', icon: <DashboardIcon /> },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useTheme();
  const { userProfile, householdId } = useAppContext();
  const isScoped = userProfile
    ? (userProfile.memberships?.[householdId]?.accessLevel ?? 'full') !== 'full'
    : false;
  const leftItems = isScoped ? SCOPED_LEFT_ITEMS : LEFT_ITEMS;
  const rightItems = isScoped ? SCOPED_RIGHT_ITEMS : RIGHT_ITEMS;
  const { data: pendingItems = [] } = usePendingFinancialMessages(isScoped ? '' : householdId);
  const pendingCount = pendingItems.length;

  const isEntry = pathname === '/entry';
  const isDark = theme.palette.mode === 'dark';

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 64 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.target.getBoundingClientRect();
        setSize({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const renderNavItem = (item: NavItem) => {
    const isActive = pathname === item.path;
    const isPending = item.path === '/pending';
    return (
      <Box
        component="button"
        type="button"
        key={item.path}
        onClick={() => navigate(item.path)}
        aria-label={isPending && pendingCount > 0 ? `Approvals, ${pendingCount} items require attention` : item.label}
        sx={{
          border: 0,
          bgcolor: 'transparent',
          font: 'inherit',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2px',
          py: '6px',
          px: { xs: 1, sm: 1.5 },
          borderRadius: '24px',
          cursor: 'pointer',
          color: isActive ? 'primary.main' : 'text.primary',
          transition: 'all 0.2s ease',
          '&:hover': { transform: 'scale(1.08)' },
          '&:active': { transform: 'scale(0.92)' },
          '& .MuiSvgIcon-root': {
            fontSize: '22px',
            transition: 'all 0.2s ease',
          },
        }}
      >
        {isPending ? (
          <Badge
            color="warning"
            badgeContent={pendingCount}
            max={99}
            invisible={pendingCount === 0}
            overlap="circular"
            sx={{
              '& .MuiBadge-badge': {
                minWidth: 18,
                height: 18,
                px: 0.5,
                fontSize: 10,
                fontWeight: 800,
              },
            }}
          >
            {item.icon}
          </Badge>
        ) : item.icon}
        <Typography
          sx={{
            fontSize: '10px',
            fontWeight: isActive ? 700 : 500,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </Typography>
      </Box>
    );
  };

  // Generate notched path dynamically
  const getPathData = () => {
    const W = size.width;
    const H = size.height;
    if (W === 0) return '';

    const R = 32; // Corner radius of the pill
    const cX = W / 2;
    const depth = 34; // Depth of the notch dip
    const notchWidth = 48; // Width from center to start of curve

    const x0 = cX - notchWidth;
    const x1 = x0 + 20;
    const x2 = cX - 20;
    const x3 = cX + notchWidth;
    const x4 = cX + 20;
    const x5 = x3 - 20;

    return `
      M ${R},0
      L ${x0},0
      C ${x1},0 ${x2},${depth} ${cX},${depth}
      C ${x4},${depth} ${x5},0 ${x3},0
      L ${W - R},0
      A ${R},${R} 0 0 1 ${W},${R}
      L ${W},${H - R}
      A ${R},${R} 0 0 1 ${W - R},${H}
      L ${R},${H}
      A ${R},${R} 0 0 1 0,${H - R}
      L 0,${R}
      A ${R},${R} 0 0 1 ${R},0
      Z
    `.replace(/\s+/g, ' ').trim();
  };

  return (
    <Paper
      ref={containerRef}
      elevation={0}
      sx={{
        display: { xs: 'block', md: 'none' },
        position: 'fixed',
        bottom: { xs: 16, md: 24 },
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        bgcolor: 'transparent',
        boxShadow: 'none',
        padding: '6px',
        maxWidth: 'calc(100vw - 24px)',
        overflow: 'visible',
        animation: 'navFloatIn 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        '@keyframes navFloatIn': {
          from: { opacity: 0, transform: 'translateX(-50%) translateY(20px)' },
          to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        },
      }}
    >
      {size.width > 0 && (
        <svg
          width={size.width}
          height={size.height}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            zIndex: -1,
            pointerEvents: 'none',
            overflow: 'visible',
            filter: `drop-shadow(0 0 16px ${alpha(theme.palette.primary.main, 0.15)}) drop-shadow(0 0 40px ${alpha(theme.palette.primary.main, 0.08)})`,
          }}
        >
          <path
            d={getPathData()}
            fill={theme.palette.background.paper}
            stroke={alpha(theme.palette.primary.main, 0.25)}
            strokeWidth={1}
          />
        </svg>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: 52,
          gap: '4px',
        }}
      >
        {leftItems.map(renderNavItem)}

        {/* Center + button — emerges from the notch in the pill above */}
        <Box
          onClick={() => navigate('/entry')}
          sx={{
            width: 56,
            height: 56,
            mt: '-34px',
            mx: '6px',
            flexShrink: 0,
            borderRadius: '50%',
            bgcolor: isEntry ? 'primary.dark' : 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: isDark
              ? `0 4px 16px ${alpha(theme.palette.primary.main, 0.5)}`
              : `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
            transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease, box-shadow 0.2s ease',
            '&:hover': {
              transform: 'scale(1.1)',
              boxShadow: isDark
                ? `0 6px 22px ${alpha(theme.palette.primary.main, 0.65)}`
                : `0 6px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
            },
            '&:active': { transform: 'scale(0.92)' },
            '& .MuiSvgIcon-root': { fontSize: '30px' },
          }}
        >
          <AddIcon />
        </Box>

        {rightItems.map(renderNavItem)}
      </Box>
    </Paper>
  );
}
