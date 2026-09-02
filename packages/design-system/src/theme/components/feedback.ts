import type { Components, Theme } from '@mui/material/styles';
import { designTokens } from '../../foundations/tokens';
import type { OverrideContext } from './types';

export const feedbackOverrides = ({ tokens: t }: OverrideContext): Components<Theme> => ({
  MuiLinearProgress: { styleOverrides: { root: { height: 10, borderRadius: 5, backgroundColor: t.surfaceOffWhite } } },
  MuiAlert: {
    styleOverrides: {
      root: { borderRadius: 8 },
      standardInfo: {
        backgroundColor: t.surfaceContainerHigh,
        border: `1px solid ${t.borderGray}`,
        color: t.textSecondary,
        '& .MuiAlert-icon': { color: designTokens.color.primaryContainer },
      },
    },
  },
});
