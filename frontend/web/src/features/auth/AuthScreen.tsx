import { useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
  Alert,
  useTheme,
  InputAdornment
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { HomeIcon } from '@/components/AppIcon';
import { GroupAddIcon } from '@/components/AppIcon';
import { AddHomeIcon } from '@/components/AppIcon';
import { LogoutIcon } from '@/components/AppIcon';
import { InfoOutlinedIcon } from '@/components/AppIcon';
import { KeyIcon } from '@/components/AppIcon';
import { isFirebaseReady } from '@/libs/auth';
import { useAppContext } from '@/hooks/useAppContext';
import { versionLabel } from '@/version';
import type { AccessLevel } from '@kippa/domain';

function readInviteParams(): { inviteId: string; level: AccessLevel | null } {
  const params = new URLSearchParams(window.location.search);
  const inviteId = params.get('invite')?.trim() ?? '';
  const level = params.get('level') === 'shared' ? 'sharedBalanceOnly' : null;
  return { inviteId, level };
}

export function AuthScreen() {
  const theme = useTheme();
  const logoSrc = '/icons/logo_green_transparent.png';
  const { enqueueSnackbar } = useSnackbar();
  const {
    userProfile,
    loginWithGoogle,
    logout,
    createHousehold,
    requestToJoinHousehold
  } = useAppContext();

  const [loading, setLoading] = useState(false);

  // Shared account setup state. An invite link (/join?invite=<id>) pre-fills
  // the join field so the invitee only signs in and requests to join.
  const [householdName, setHouseholdName] = useState('');
  const [{ inviteId: inviteFromLink, level: levelFromLink }] = useState(readInviteParams);
  const [householdIdToJoin, setHouseholdIdToJoin] = useState(inviteFromLink);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Google Authentication failed', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHousehold = async () => {
    if (!userProfile) return;
    if (!householdName.trim()) {
      enqueueSnackbar('Please enter a space name', { variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await createHousehold(householdName.trim());
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to create space', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHousehold = async () => {
    if (!userProfile) return;
    if (!householdIdToJoin.trim()) {
      enqueueSnackbar('Please enter a valid Invite ID', { variant: 'warning' });
      return;
    }
    setLoading(true);
    try {
      await requestToJoinHousehold(householdIdToJoin.trim(), levelFromLink ?? undefined);
      enqueueSnackbar('Request sent — the space owner will review it.', { variant: 'success' });
    } catch (err: any) {
      enqueueSnackbar(err.message || 'Failed to request join. Make sure the ID is correct.', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (!isFirebaseReady) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Container maxWidth="sm">
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            Firebase is not configured. Copy <strong>.env.example</strong> to <strong>.env</strong> and set your{' '}
            <strong>VITE_FIREBASE_*</strong> credentials.
          </Alert>
        </Container>
      </Box>
    );
  }

  // If user is authenticated but has no household
  if (userProfile && !userProfile.householdId) {
    return (
      <Box sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: 'transparent',
        p: { xs: 2, sm: 4 },
        position: 'relative',
        zIndex: 1,
      }}>
        <Container maxWidth="md">
          <Stack spacing={4} alignItems="center">
            {/* Header / Intro section */}
            <Box textAlign="center" sx={{ maxWidth: 600, mb: 1 }}>
              <Typography 
                variant="h2" 
                sx={{ 
                  fontSize: { xs: '1.75rem', sm: '2.25rem' }, 
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: 'text.primary',
                  mb: 1.5
                }}
              >
                Set Up Your Shared Account
              </Typography>
              <Typography 
                variant="body1" 
                sx={{ 
                  color: 'text.secondary', 
                  fontSize: { xs: '14px', sm: '16px' },
                  lineHeight: 1.6,
                  px: 2
                }}
              >
                Welcome back, <strong>{userProfile.displayName}</strong>! To get started, you need to create a new space or join an existing one.
              </Typography>
            </Box>

            {/* Core Cards: Split Layout */}
            <Stack 
              direction={{ xs: 'column', md: 'row' }} 
              spacing={4} 
              sx={{ width: '100%', alignItems: 'stretch' }}
            >
              {/* Card A: Create Household */}
              <Card 
                sx={{ 
                  flex: 1, 
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    '& .icon-badge-create': {
                      transform: 'scale(1.08)',
                      bgcolor: alpha(theme.palette.primary.main, 0.15)
                    }
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* Icon Badge */}
                  <Box 
                    className="icon-badge-create"
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '12px',
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: 'primary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 3,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <AddHomeIcon sx={{ fontSize: 28 }} />
                  </Box>

                  <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 1.5 }}>
                    Create a New Space
                  </Typography>
                  
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.6, flexGrow: 1 }}>
                    Establish a brand new shared ledger workspace. As the creator, you'll be the owner and can invite other members with an invite link anytime.
                  </Typography>

                  <Stack spacing={2} sx={{ mt: 'auto' }}>
                    <TextField
                      fullWidth
                      label="Space name"
                      placeholder="e.g. My Cozy Home"
                      value={householdName}
                      onChange={e => setHouseholdName(e.target.value)}
                      disabled={loading}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <HomeIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                            </InputAdornment>
                          ),
                        }
                      }}
                    />
                    <Button 
                      fullWidth
                      variant="contained" 
                      onClick={handleCreateHousehold}
                      loading={loading}
                    >
                      Create Space
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              {/* Card B: Join Household */}
              <Card 
                sx={{ 
                  flex: 1, 
                  display: 'flex',
                  flexDirection: 'column',
                  '&:hover': {
                    '& .icon-badge-join': {
                      transform: 'scale(1.08)',
                      bgcolor: alpha(theme.palette.secondary.main, 0.15)
                    }
                  }
                }}
              >
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* Icon Badge */}
                  <Box 
                    className="icon-badge-join"
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '12px',
                      bgcolor: alpha(theme.palette.secondary.main, 0.1),
                      color: 'secondary.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      mb: 3,
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <GroupAddIcon sx={{ fontSize: 28 }} />
                  </Box>

                  <Typography variant="h3" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 1.5 }}>
                    Join an Existing Space
                  </Typography>
                  
                  <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4, lineHeight: 1.6, flexGrow: 1 }}>
                    Connect to an existing workspace created by someone else. You will need their Invite ID to instantly sync up and share budget ledger logs.
                  </Typography>

                  <Stack spacing={2} sx={{ mt: 'auto' }}>
                    <TextField
                      fullWidth
                      label="Invite ID"
                      placeholder="Paste the Invite ID from your invite link"
                      value={householdIdToJoin}
                      onChange={e => setHouseholdIdToJoin(e.target.value)}
                      disabled={loading}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <InputAdornment position="start">
                              <KeyIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                            </InputAdornment>
                          ),
                        }
                      }}
                    />
                    <Button 
                      fullWidth
                      variant="outlined" 
                      onClick={handleJoinHousehold}
                      loading={loading}
                    >
                      Join Space
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>

            {/* Help Alert tip block */}
            <Alert 
              severity="info" 
              icon={<InfoOutlinedIcon fontSize="small" />}
              sx={{ width: '100%' }}
            >
              <strong>Tip:</strong> You can find your Invite ID inside the user profile menu at the top-right corner of the application once logged in.
            </Alert>

            {/* Logout / Switch User */}
            <Button 
              variant="text" 
              color="error" 
              onClick={handleLogout} 
              startIcon={<LogoutIcon fontSize="small" />}
            >
              Sign out / Change Account
            </Button>
          </Stack>
        </Container>
      </Box>
    );
  }

  // Welcome / Google sign in screen — follows the supplied finance-app
  // reference while retaining the existing authentication flow.
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        bgcolor: 'primary.dark',
        color: 'primary.contrastText',
        display: 'grid',
        placeItems: 'center',
        px: { xs: 3, sm: 5 },
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 470, minHeight: { xs: '100dvh', sm: 720 }, py: { xs: 5, sm: 7 }, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box sx={{ width: 42, height: 42, borderRadius: 2.5, bgcolor: alpha(theme.palette.primary.contrastText, 0.96), display: 'grid', placeItems: 'center' }}>
            <img src={logoSrc} alt="Kippa Logo" style={{ width: 26, height: 26, objectFit: 'contain' }} />
          </Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.05em', color: 'primary.contrastText' }}>Kippa</Typography>
        </Stack>

        <Box sx={{ mt: 'auto', mb: { xs: 5, sm: 2 } }}>
          <Typography sx={{ fontSize: { xs: '3rem', sm: '4rem' }, lineHeight: 1.05, fontWeight: 500, letterSpacing: '-0.065em', maxWidth: 430, textWrap: 'balance', color: 'primary.contrastText' }}>
            Track your spending effortlessly
          </Typography>
          <Typography sx={{ mt: 2.5, mb: 4.5, color: alpha(theme.palette.primary.contrastText, 0.78), fontSize: { xs: 15, sm: 17 }, lineHeight: 1.55, maxWidth: 420 }}>
            Manage your space finances, follow every expense, and keep your goals in sight.
          </Typography>

          <Box sx={{ width: '100%' }}>
            <Button
              fullWidth
              variant="contained"
              onClick={handleGoogleSignIn}
              loading={loading}
              sx={{
                height: 62,
                borderRadius: 999,
                bgcolor: 'primary.contrastText',
                color: 'primary.dark',
                textTransform: 'none',
                fontSize: 16,
                '&:hover': { bgcolor: alpha(theme.palette.primary.contrastText, 0.9), transform: 'translateY(-1px)' },
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center">
                <svg height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path>
                </svg>
                <Typography variant="body1" sx={{ fontWeight: 700, color: 'inherit', fontSize: '15px' }}>
                  Get started with Google
                </Typography>
              </Stack>
            </Button>
          </Box>
          <Typography sx={{ mt: 2.5, textAlign: 'center', color: alpha(theme.palette.primary.contrastText, 0.72), fontSize: 13 }}>
            Secure sign-in · Your financial data stays private
          </Typography>
          <Typography sx={{ mt: 1, textAlign: 'center', color: alpha(theme.palette.primary.contrastText, 0.55), fontSize: 11 }}>
            {versionLabel}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
