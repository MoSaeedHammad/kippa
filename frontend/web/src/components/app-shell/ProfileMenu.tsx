import {
  Box,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
  ListItemText,
  Typography,
  Stack,
  Avatar,
  Tooltip,
  IconButton,
} from '@mui/material';
import { HomeIcon } from '@/components/AppIcon';
import { LogoutIcon } from '@/components/AppIcon';
import { LightModeIcon } from '@/components/AppIcon';
import { DarkModeIcon } from '@/components/AppIcon';
import { SettingsBrightnessIcon } from '@/components/AppIcon';
import { CheckIcon } from '@/components/AppIcon';
import { ContentCopyIcon } from '@/components/AppIcon';
import { VisibilityIcon } from '@/components/AppIcon';
import { VisibilityOffIcon } from '@/components/AppIcon';
import { useTranslation } from 'react-i18next';
import type { ThemeModePref } from '@/contexts/themeModeContext';
import type { UserProfile, Household } from '@kippa/domain';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { versionDetails, versionLabel } from '@/version';

interface ProfileMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  modePref: ThemeModePref;
  setModePref: (pref: ThemeModePref) => void;
  userProfile: UserProfile | null;
  householdId: string;
  userHouseholds: Household[];
  householdName: string;
  switchHousehold: (id: string) => Promise<void>;
  logout: () => Promise<void>;
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

export function ProfileMenu({
  anchorEl,
  open,
  onClose,
  modePref,
  setModePref,
  userProfile,
  householdId,
  userHouseholds,
  householdName,
  switchHousehold,
  logout,
}: ProfileMenuProps) {
  const { privacyMode, setPrivacyMode } = usePrivacyMode();
  const { t } = useTranslation('appShell');
  const { language, setLanguage } = useLanguage();

  const handleClose = () => {
    onClose();
  };

  return (
    <Menu
      id="profile-menu"
      anchorEl={anchorEl}
      open={open}
      onClose={handleClose}
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
      {/* User details */}
      <Box sx={{ px: 2.5, py: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar
            src={userProfile?.photoURL || undefined}
            sx={{ bgcolor: 'primary.main', width: 44, height: 44, fontSize: '1.1rem', fontWeight: 600 }}
          >
            {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'U'}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" noWrap sx={{ fontWeight: 600, color: 'text.primary' }}>
              {userProfile?.displayName || t('profileMenu.defaultName')}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', wordBreak: 'break-all', fontSize: '0.75rem' }}>
              {userProfile?.email || t('profileMenu.noEmail')}
            </Typography>
          </Box>
        </Stack>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Household sharing info */}
      <Box sx={{ py: 0.75 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontSize: '0.65rem',
            letterSpacing: '0.08em',
            px: 2.5,
            mb: 1,
            display: 'block',
          }}
        >
          {t('profileMenu.currentSpace')}
        </Typography>

        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          sx={{
            mx: 1,
            px: 1.5,
            py: 1.25,
            borderRadius: '8px',
            bgcolor: 'action.hover',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <HomeIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8125rem' }}>
              {householdName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.6875rem' }}>
              {householdId ? t('profileMenu.spaceId', { id: householdId.slice(0, 8) }) : t('profileMenu.noSpace')}
            </Typography>
          </Box>
          {householdId && (
            <Tooltip title={t('profileMenu.copyInviteId')}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(householdId || '');
                }}
                sx={{
                  p: 0.5,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '6px',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <ContentCopyIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {/* Quick Switch spaces */}
      {userHouseholds.length > 1 && (
        <>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: 'text.secondary',
              textTransform: 'uppercase',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              px: 2.5,
              mt: 1.5,
              mb: 0.5,
              display: 'block',
            }}
          >
            {t('profileMenu.switchSpace')}
          </Typography>
          {userHouseholds.map((hh) => {
            if (hh.id === householdId) return null;
            return (
              <MenuItem
                key={hh.id}
                onClick={async () => {
                  handleClose();
                  try {
                    await switchHousehold(hh.id);
                  } catch (err) {
                    console.error('Failed to switch space:', err);
                  }
                }}
                sx={menuItemStyle}
              >
                <ListItemIcon>
                  <HomeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={hh.name} secondary={t('profileMenu.spaceId', { id: hh.id.slice(0, 8) })} />
              </MenuItem>
            );
          })}
        </>
      )}

      <Divider sx={{ my: 1 }} />

      {/* Appearance / Theme */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          fontSize: '0.65rem',
          letterSpacing: '0.08em',
          px: 2.5,
          mt: 0.5,
          mb: 0.5,
          display: 'block',
        }}
      >
        {t('profileMenu.appearance')}
      </Typography>
      {([
        { value: 'light' as ThemeModePref, label: t('profileMenu.light'), Icon: LightModeIcon },
        { value: 'dark' as ThemeModePref, label: t('profileMenu.dark'), Icon: DarkModeIcon },
        { value: 'system' as ThemeModePref, label: t('profileMenu.systemDefault'), Icon: SettingsBrightnessIcon },
      ]).map(({ value, label, Icon }) => {
        const selected = modePref === value;
        return (
          <MenuItem
            key={value}
            onClick={() => { setModePref(value); handleClose(); }}
            sx={{ ...menuItemStyle, py: 0.75 }}
          >
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={label} />
            {selected && <CheckIcon fontSize="small" sx={{ color: 'primary.main', ml: 'auto' }} />}
          </MenuItem>
        );
      })}

      <Divider sx={{ my: 1 }} />

      {/* Language */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 700,
          color: 'text.secondary',
          textTransform: 'uppercase',
          fontSize: '0.65rem',
          letterSpacing: '0.08em',
          px: 2.5,
          mt: 0.5,
          mb: 0.5,
          display: 'block',
        }}
      >
        {t('profileMenu.language')}
      </Typography>
      {([
        { value: 'en' as const, label: t('profileMenu.english') },
        { value: 'ar' as const, label: t('profileMenu.arabic') },
      ]).map(({ value, label }) => (
        <MenuItem
          key={value}
          onClick={() => { setLanguage(value); handleClose(); }}
          sx={{ ...menuItemStyle, py: 0.75 }}
        >
          <ListItemText primary={label} />
          {language === value && <CheckIcon fontSize="small" sx={{ color: 'primary.main', ms: 'auto' }} />}
        </MenuItem>
      ))}

      <Divider sx={{ my: 1 }} />

      {/* Privacy mode — mask monetary values for screen sharing / demos */}
      <MenuItem
        onClick={() => { setPrivacyMode(!privacyMode); handleClose(); }}
        sx={{ ...menuItemStyle, py: 0.75 }}
      >
        <ListItemIcon>
          {privacyMode ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText
          primary={privacyMode ? t('profileMenu.privacyModeOn') : t('profileMenu.privacyMode')}
          secondary={t('profileMenu.hideBalances')}
        />
        {privacyMode && <CheckIcon fontSize="small" sx={{ color: 'primary.main', ml: 'auto' }} />}
      </MenuItem>

      <Divider sx={{ my: 1 }} />

      <MenuItem
        onClick={() => { handleClose(); logout(); }}
        sx={{
          ...menuItemStyle,
          color: 'error.main',
          '& .MuiListItemIcon-root': { minWidth: 30, color: 'error.main' },
          '& .MuiListItemText-primary': { fontSize: '0.875rem', fontWeight: 600, color: 'error.main' },
        }}
      >
        <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary={t('profileMenu.signOut')} />
      </MenuItem>
      <Divider />
      <Box sx={{ px: 2, py: 1 }}>
        <Tooltip title={versionDetails} placement="top">
          <Typography variant="fieldHint" color="text.secondary" sx={{ cursor: 'default' }}>
            {versionLabel}
          </Typography>
        </Tooltip>
      </Box>
    </Menu>
  );
}
