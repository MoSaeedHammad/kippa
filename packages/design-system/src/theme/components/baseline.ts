import type { Components, Theme } from '@mui/material/styles';
import { designTokens } from '../../foundations/tokens';
import type { OverrideContext } from './types';

export const baselineOverrides = ({ mode, tokens: t }: OverrideContext): Components<Theme> => ({
  MuiTypography: { styleOverrides: { root: { color: 'inherit' } } },
  MuiCssBaseline: {
    styleOverrides: `
      html { color-scheme: ${mode}; }
      input, textarea, select { font-size: 16px !important; }

      .notistack-MuiContent {
        box-sizing: border-box;
        min-height: 52px;
        padding: 8px 14px !important;
        border: 1px solid ${t.borderGray} !important;
        border-radius: ${designTokens.radius.control}px !important;
        background-color: ${t.surfacePure} !important;
        color: ${t.textPrimary} !important;
        box-shadow: ${designTokens.shadow.lifted} !important;
        font-family: ${designTokens.typography.fontFamily};
        font-size: 14px;
        font-weight: 600;
        line-height: 22px;
        letter-spacing: 0;
      }
      .notistack-MuiContent #notistack-snackbar {
        min-width: 0;
        padding: 6px 0;
        overflow-wrap: anywhere;
      }
      .notistack-MuiContent-default { border-left: 4px solid ${designTokens.color.primaryContainer} !important; }
      .notistack-MuiContent-success { border-left: 4px solid ${designTokens.color.success} !important; }
      .notistack-MuiContent-warning { border-left: 4px solid ${designTokens.color.warning} !important; }
      .notistack-MuiContent-error { border-left: 4px solid ${designTokens.color.error} !important; }
      .notistack-MuiContent-info { border-left: 4px solid ${designTokens.color.primaryContainer} !important; }
      .notistack-MuiContent-success svg { color: ${designTokens.color.success}; }
      .notistack-MuiContent-warning svg { color: ${designTokens.color.warning}; }
      .notistack-MuiContent-error svg { color: ${designTokens.color.error}; }
      .notistack-MuiContent-info svg { color: ${designTokens.color.primaryContainer}; }
      .notistack-MuiContent button { color: ${designTokens.color.primaryContainer}; }
    `,
  },
  MuiDivider: { styleOverrides: { root: { borderColor: 'divider' } } },
});
