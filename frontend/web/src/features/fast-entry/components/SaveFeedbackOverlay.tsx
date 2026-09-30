import { alpha, Box, Paper, Portal, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { CheckCircleIcon, ReceiptLongIcon } from '@/components/AppIcon';

export type SaveFeedbackContent = { account: string; amount: string; category: string; title: string };

export function SaveFeedbackOverlay({ content, onClose, open }: { content: SaveFeedbackContent; onClose: () => void; open: boolean }) {
  const { t } = useTranslation('fastEntry');
  if (!open) return null;

  return (
    <Portal>
      <Paper
        variant="saveFeedbackOverlay"
        role="status"
        aria-live="polite"
        aria-label={t('feedback.entrySavedAria')}
        onClick={onClose}
        sx={{
          '--save-origin-x': '50%',
          '--save-origin-y': { xs: 'calc(100% - 122px)', lg: 'calc(100% - 96px)' },
          position: 'fixed',
          inset: 0,
          zIndex: (theme) => theme.zIndex.modal + 2,
          cursor: 'pointer',
          overflow: 'hidden',
          animation: 'fastEntrySendCover 1600ms cubic-bezier(0.22, 1, 0.36, 1) both',
          '@keyframes fastEntrySendCover': {
            '0%': { opacity: 1, clipPath: 'circle(0 at var(--save-origin-x) var(--save-origin-y))' },
            '22%, 90%': { opacity: 1, clipPath: 'circle(150vmax at var(--save-origin-x) var(--save-origin-y))' },
            '100%': { opacity: 0, clipPath: 'circle(150vmax at var(--save-origin-x) var(--save-origin-y))' },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'feedbackFade 1600ms ease both',
            '@keyframes feedbackFade': { '0%, 100%': { opacity: 0 }, '10%, 90%': { opacity: 1 } },
          },
        }}
      >
        {[0, 1].map((ring) => (
          <Box
            key={ring}
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: { xs: 220, sm: 320 },
              aspectRatio: '1',
              borderRadius: '50%',
              border: '1px solid',
              borderColor: (theme) => alpha(theme.palette.common.white, 0.2),
              animation: `fastEntryRing 720ms ${100 + ring * 90}ms ease-out both`,
              '@keyframes fastEntryRing': {
                '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.25)' },
                '22%': { opacity: 1 },
                '100%': { opacity: 0, transform: 'translate(-50%, -50%) scale(2.6)' },
              },
            }}
          />
        ))}

        <Stack
          alignItems="center"
          spacing={0.5}
          sx={{
            position: 'absolute',
            left: '50%',
            top: '54%',
            width: 'min(84vw, 440px)',
            textAlign: 'center',
            animation: 'fastEntryCopy 1600ms cubic-bezier(0.22, 1, 0.36, 1) both',
            '@keyframes fastEntryCopy': {
              '0%': { transform: 'translate(-50%, 22px) scale(0.96)' },
              '32%': { transform: 'translate(-50%, 0) scale(1)' },
              '88%': { transform: 'translate(-50%, -4px) scale(1)' },
              '100%': { transform: 'translate(-50%, -18px) scale(0.98)' },
            },
          }}
        >
          <Typography variant="sectionLabel" color="inherit">{content.title}</Typography>
          <Typography variant="h2" color="inherit">{content.amount}</Typography>
          <Typography variant="body2" color="inherit">{content.category} · {content.account}</Typography>
          <Typography variant="fieldHint" color="inherit" sx={{ pt: 1 }}>{t('feedback.tapAnywhere')}</Typography>
        </Stack>

        <Stack
          alignItems="center"
          sx={{
            position: 'absolute',
            left: 'var(--save-origin-x)',
            top: 'var(--save-origin-y)',
            animation: 'fastEntrySendIcon 1100ms cubic-bezier(0.22, 1, 0.36, 1) both',
            '@keyframes fastEntrySendIcon': {
              '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.42) rotate(10deg)' },
              '14%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1) rotate(0deg)' },
              '62%': { opacity: 1, transform: 'translate(-50%, calc(-50% - 52vh)) scale(1.04) rotate(-4deg)' },
              '82%': { opacity: 1, transform: 'translate(-50%, calc(-50% - 58vh)) scale(0.92) rotate(0deg)' },
              '100%': { opacity: 0, transform: 'translate(-50%, calc(-50% - 64vh)) scale(0.72)' },
            },
          }}
        >
          {[0, 1, 2].map((trail) => (
            <Box
              key={trail}
              sx={{
                position: 'absolute',
                top: 124 + trail * 22,
                width: 11 - trail,
                height: 11 - trail,
                borderRadius: '50%',
                bgcolor: 'secondary.main',
                opacity: 0.68 - trail * 0.16,
                animation: `fastEntryTrail 260ms ${trail * 45}ms ease-in-out infinite alternate`,
                '@keyframes fastEntryTrail': {
                  from: { transform: 'translateY(0) scale(0.75)' },
                  to: { transform: 'translateY(8px) scale(1)' },
                },
              }}
            />
          ))}
          <Box
            sx={{
              width: { xs: 120, sm: 132 },
              height: { xs: 120, sm: 132 },
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'secondary.main',
              color: 'secondary.contrastText',
              position: 'relative',
            }}
          >
            <ReceiptLongIcon
              fontSize="inherit"
              sx={{
                fontSize: { xs: 72, sm: 80 },
                position: 'absolute',
                animation: 'fastEntryReceiptOut 1100ms ease-out both',
                '@keyframes fastEntryReceiptOut': {
                  '0%, 45%': { opacity: 1, transform: 'scale(1) rotate(0deg)' },
                  '62%, 100%': { opacity: 0, transform: 'scale(0.55) rotate(-18deg)' },
                },
              }}
            />
            <CheckCircleIcon
              fontSize="inherit"
              sx={{
                fontSize: { xs: 72, sm: 80 },
                position: 'absolute',
                animation: 'fastEntryCheckIn 1100ms cubic-bezier(0.22, 1, 0.36, 1) both',
                '@keyframes fastEntryCheckIn': {
                  '0%, 48%': { opacity: 0, transform: 'scale(0.35) rotate(18deg)' },
                  '68%, 100%': { opacity: 1, transform: 'scale(1) rotate(0deg)' },
                },
              }}
            />
          </Box>
        </Stack>
      </Paper>
    </Portal>
  );
}
