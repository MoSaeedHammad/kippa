import { Box, CssBaseline, Stack, ThemeProvider, Typography } from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';

interface AppLoadingScreenProps {
  theme: Theme;
}

export function AppLoadingScreen({ theme }: AppLoadingScreenProps) {
  const { t } = useTranslation('appShell');
  const logoSrc = theme.palette.mode === 'dark'
    ? '/icons/logo_white_transparent.png'
    : '/icons/logo_green_transparent.png';

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        role="status"
        aria-label={t('loadingScreen.aria')}
        sx={{
          position: 'fixed',
          inset: 0,
          zIndex: theme => theme.zIndex.modal + 10,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'background.default',
          color: 'text.primary',
        }}
      >
        <Stack
          alignItems="center"
          spacing={2.5}
          sx={{
            animation: 'splashContentIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
            '@keyframes splashContentIn': {
              from: { opacity: 0, transform: 'translateY(8px)' },
              to: { opacity: 1, transform: 'translateY(0)' },
            },
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          <Box
            sx={{
              width: 80,
              height: 80,
              p: 2,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '20px',
            }}
          >
            <Box
              component="img"
              src={logoSrc}
              alt="Kippa"
              sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </Box>

          <Stack alignItems="center" spacing={0.75}>
            <Typography variant="h1" sx={{ fontSize: 28, lineHeight: 1.2, letterSpacing: '-0.04em' }}>
              Kippa
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('loadingScreen.tagline')}
            </Typography>
          </Stack>

          <Box
            aria-hidden
            sx={{
              width: 112,
              height: 4,
              mt: 0.5,
              overflow: 'hidden',
              borderRadius: 'pill',
              bgcolor: theme => alpha(theme.palette.primary.main, 0.12),
            }}
          >
            <Box
              sx={{
                width: '44%',
                height: '100%',
                borderRadius: 'inherit',
                bgcolor: 'primary.main',
                animation: 'splashProgress 1250ms ease-in-out infinite',
                '@keyframes splashProgress': {
                  from: { transform: 'translateX(-110%)' },
                  to: { transform: 'translateX(250%)' },
                },
                '@media (prefers-reduced-motion: reduce)': {
                  width: '100%',
                  animation: 'none',
                  opacity: 0.55,
                },
              }}
            />
          </Box>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
