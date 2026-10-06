import { alpha, type Components, type Theme } from '@mui/material/styles';
import { designTokens } from '../../foundations/tokens';
import type { OverrideContext } from './types';

declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides { categoryRow: true }
}

export const cardOverrides = ({ mode, tokens: t }: OverrideContext): Components<Theme> => {
  const highlight = mode === 'dark' ? 'inset 0 1px 0 rgba(255,255,255,.045)' : 'inset 0 1px 0 rgba(255,255,255,.9)';
  const shadow = mode === 'dark' ? '0 12px 28px rgba(0,0,0,.16)' : '0 10px 26px rgba(24,53,34,.035)';
  return {
    MuiPaper: { styleOverrides: { root: { backgroundColor: mode === 'dark' ? 'rgba(14,17,16,.96)' : 'rgba(255,255,255,.92)', backgroundImage: 'none' } }, variants: [
      { props: { variant: 'categoryRow' }, style: {
        borderRadius: 10, border: '1px solid transparent', boxShadow: 'none',
        backgroundColor: alpha(designTokens.color.primaryContainer, mode === 'dark' ? .12 : .06),
        '.category-dot': { width: 7, height: 7, borderRadius: '50%', backgroundColor: designTokens.color.primaryContainer, flexShrink: 0 },
        '&[data-category-type="income"] .category-dot': { backgroundColor: designTokens.color.success },
        '.category-row-action': { width: 32, height: 32, color: designTokens.color.primaryContainer, opacity: 0, pointerEvents: 'none', transition: 'opacity .15s ease' },
        '&:hover .category-row-action, &:focus-within .category-row-action': { opacity: 1, pointerEvents: 'auto' },
      } },
      { props: { variant: 'amountPanel' }, style: { borderRadius: 24, border: '1px solid transparent', backgroundColor: designTokens.color.primary, color: designTokens.color.onPrimary, boxShadow: designTokens.shadow.lifted, transition: 'all .2s ease' } },
      { props: { variant: 'amountPanelInactive' }, style: { borderRadius: 24, border: `1px solid ${t.borderGray}`, backgroundColor: t.surfacePure, color: t.textSecondary, boxShadow: 'none', transition: 'all .2s ease' } },
      { props: { variant: 'assistantAvatar' }, style: { width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', backgroundColor: designTokens.color.primary, color: designTokens.color.onPrimary, boxShadow: designTokens.shadow.lifted } },
      { props: { variant: 'assistantComposer' }, style: { minHeight: 72, padding: '10px 10px 10px 20px', display: 'flex', alignItems: 'flex-end', gap: 8, borderRadius: 24, border: `1px solid ${t.borderGray}`, backgroundColor: t.surfacePure, color: t.textPrimary, boxShadow: 'none', transition: 'border-color .2s ease', '&:focus-within': { borderColor: designTokens.color.primaryContainer } } },
      { props: { variant: 'assistantUserMessage' }, style: { borderRadius: '18px 18px 6px 18px', padding: '10px 16px', backgroundColor: designTokens.color.primary, color: designTokens.color.onPrimary, boxShadow: 'none' } },
      { props: { variant: 'assistantReply' }, style: { backgroundColor: 'transparent', color: t.textPrimary, boxShadow: 'none', '& p': { margin: '0 0 10px' }, '& p:last-child': { marginBottom: 0 }, '& ul, & ol': { margin: '4px 0 10px', paddingLeft: 20 }, '& li': { marginBottom: 4 }, '& strong': { fontWeight: 800 }, '& code': { padding: '2px 4px', borderRadius: 4, backgroundColor: t.surfaceOffWhite, fontSize: 13 } } },
      { props: { variant: 'assistantMessageAvatar' }, style: { width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0, backgroundColor: designTokens.color.secondary, color: designTokens.color.onSecondary, boxShadow: 'none' } },
      { props: { variant: 'assistantHeader' }, style: { height: 56, borderRadius: 0, border: 0, backgroundColor: t.surfaceContainerLow, boxShadow: 'none' } },
      { props: { variant: 'assistantCooldown' }, style: { borderRadius: 16, border: 0, padding: 16, backgroundColor: t.surfaceOffWhite, color: t.textPrimary, boxShadow: 'none' } },
      { props: { variant: 'assistantAction' }, style: { borderRadius: 16, border: `1px solid ${t.borderGray}`, padding: 16, backgroundColor: t.surfacePure, color: t.textPrimary, boxShadow: 'none' } },
      { props: { variant: 'assistantChart' }, style: { borderRadius: 16, border: `1px solid ${t.borderGray}`, padding: 16, backgroundColor: t.surfacePure, color: t.textPrimary, boxShadow: 'none' } },
      { props: { variant: 'cardHeaderIcon' }, style: { width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0, backgroundColor: alpha(designTokens.color.secondary, .14), color: designTokens.color.primaryContainer, boxShadow: 'none' } },
      { props: { variant: 'loanProgressSegment' }, style: { border: 0, borderRadius: 999, backgroundColor: alpha(designTokens.color.secondary, mode === 'dark' ? .14 : .12), boxShadow: 'none' } },
      { props: { variant: 'loanProgressSegmentPaid' }, style: { border: 0, borderRadius: 999, backgroundColor: designTokens.color.secondary, boxShadow: 'none' } },
      { props: { variant: 'categoryCapacity' }, style: { position: 'relative', overflow: 'hidden', borderRadius: '14px 14px 10px 10px', border: 0, backgroundColor: alpha(designTokens.color.primaryContainer, mode === 'dark' ? .16 : .075), backgroundImage: `repeating-linear-gradient(135deg, transparent 0 8px, ${alpha(designTokens.color.primaryContainer, mode === 'dark' ? .12 : .07)} 8px 10px)`, boxShadow: 'none' } },
      { props: { variant: 'categoryCapacitySpent' }, style: { position: 'absolute', insetInline: 0, bottom: 0, borderRadius: '11px 11px 8px 8px', border: 0, backgroundColor: designTokens.color.primaryContainer, boxShadow: 'none', transition: 'height .3s ease' } },
      { props: { variant: 'categoryCapacityOver' }, style: { position: 'absolute', insetInline: 0, bottom: 0, borderRadius: '11px 11px 8px 8px', border: 0, backgroundColor: designTokens.color.error, boxShadow: 'none', transition: 'height .3s ease' } },
      { props: { variant: 'saveFeedbackOverlay' }, style: { borderRadius: 0, border: 0, backgroundColor: alpha(t.surfacePure, mode === 'dark' ? .68 : .74), backgroundImage: 'none', color: t.textPrimary, boxShadow: 'none', backdropFilter: 'blur(22px) saturate(1.12)', WebkitBackdropFilter: 'blur(22px) saturate(1.12)' } },
    ] },
    MuiCard: { defaultProps: { elevation: 0 }, styleOverrides: { root: { background: t.surfacePure, border: `1px solid ${t.borderGray}`, borderRadius: 20, boxShadow: `${highlight},${shadow}`, transition: 'box-shadow .2s ease,border-color .2s ease' } }, variants: [
      { props: { variant: 'selectable' }, style: { borderRadius: 16, border: `1px solid ${t.borderGray}`, background: t.surfacePure, color: t.textSecondary, boxShadow: 'none' } },
      { props: { variant: 'selectableSelected' }, style: { borderRadius: 16, border: '1px solid transparent', background: alpha(designTokens.color.primaryContainer, .08), color: designTokens.color.primaryContainer, boxShadow: 'none' } },
    ] },
    MuiCardContent: { styleOverrides: { root: { padding: designTokens.spacing.cardPadding, '&:last-child': { paddingBottom: designTokens.spacing.cardPadding } } } },
  };
};
