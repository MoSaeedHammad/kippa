import { useState, useEffect } from 'react';
import { AppBar, Toolbar, Stack, Typography, IconButton, Tooltip, Avatar } from '@mui/material';
import { ExploreIcon } from '@/components/AppIcon';
import { useNavigate } from 'react-router-dom';
import { ActivityBell } from '@/features/activity/ActivityBell';
import { ProfileMenu } from '@/components/app-shell/ProfileMenu';
import { QuickNavMenu } from '@/components/app-shell/QuickNavMenu';
import type { ThemeModePref } from '@/contexts/themeModeContext';
import type { UserProfile, Household } from '@kippa/domain';

interface TopBarProps {
  logoSrc: string;
  modePref: ThemeModePref;
  setModePref: (pref: ThemeModePref) => void;
  userProfile: UserProfile | null;
  householdId: string;
  userHouseholds: Household[];
  switchHousehold: (id: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function TopBar({
  logoSrc,
  modePref,
  setModePref,
  userProfile,
  householdId,
  userHouseholds,
  switchHousehold,
  logout,
}: TopBarProps) {
  const navigate = useNavigate();
  const [profileAnchorEl, setProfileAnchorEl] = useState<null | HTMLElement>(null);
  const isProfileMenuOpen = Boolean(profileAnchorEl);
  const [navAnchorEl, setNavAnchorEl] = useState<null | HTMLElement>(null);
  const isNavMenuOpen = Boolean(navAnchorEl);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const currentHousehold = userHouseholds.find(hh => hh.id === householdId);
  const householdName = currentHousehold ? currentHousehold.name : 'My space';

  return (
    <>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={scrolled ? 1 : 0}
        sx={{
          top: 0,
          zIndex: theme => theme.zIndex.appBar,
          py: 0.5,
          bgcolor: scrolled ? 'background.default' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
          transition: 'background-color 0.3s ease, box-shadow 0.3s ease, backdrop-filter 0.3s ease',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: { xs: 64, md: 76 }, px: { xs: 2, sm: 3, lg: 5 } }}>
          {/* Left: Logo & Brand Name */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            onClick={() => navigate('/')}
            sx={{ cursor: 'pointer', userSelect: 'none', display: { xs: 'flex', md: 'none' } }}
          >
            <img src={logoSrc} alt="Kippa Logo" style={{ height: 32, width: 'auto' }} />
            <Typography variant="h3" sx={{ fontWeight: 'bold', letterSpacing: '0.05em', color: 'primary.main' }}>
              Kippa
            </Typography>
          </Stack>


          {/* Right: Activity Bell, Quick Nav & Profile */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Stack sx={{ display: { xs: 'flex', md: 'none' } }}><ActivityBell onClick={() => navigate('/activity')} /></Stack>
            <Tooltip title="Navigate">
              <IconButton
                onClick={(e) => setNavAnchorEl(e.currentTarget)}
                aria-label="navigation menu"
                aria-controls="quick-nav-menu"
                aria-haspopup="true"
                sx={{ p: 0.5, width: 40, height: 40, border: '1px solid', borderColor: 'divider' }}
              >
                <ExploreIcon sx={{ color: 'primary.main' }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Account Menu">
              <IconButton
                onClick={(e) => setProfileAnchorEl(e.currentTarget)}
                aria-label="account profile menu"
                aria-controls="profile-menu"
                aria-haspopup="true"
                sx={{ p: 0.5, border: '1px solid', borderColor: 'divider', width: 40, height: 40 }}
              >
                <Avatar
                  src={userProfile?.photoURL || undefined}
                  sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.875rem', fontWeight: 600 }}
                >
                  {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'U'}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <ProfileMenu
        anchorEl={profileAnchorEl}
        open={isProfileMenuOpen}
        onClose={() => setProfileAnchorEl(null)}
        modePref={modePref}
        setModePref={setModePref}
        userProfile={userProfile}
        householdId={householdId}
        userHouseholds={userHouseholds}
        householdName={householdName}
        switchHousehold={switchHousehold}
        logout={logout}
      />

      <QuickNavMenu
        anchorEl={navAnchorEl}
        open={isNavMenuOpen}
        onClose={() => setNavAnchorEl(null)}
      />
    </>
  );
}
