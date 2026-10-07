import type { ThemeOptions } from '@mui/material/styles';
import { designTokens } from '../foundations/tokens';

export const typography: ThemeOptions['typography'] = {
  fontFamily: designTokens.typography.fontFamily,
  h1: { fontSize: '54px', lineHeight: '64px', fontWeight: 700, letterSpacing: 0 },
  h2: { fontSize: '40px', lineHeight: '50px', fontWeight: 500, letterSpacing: 0 },
  h3: { fontSize: '20px', lineHeight: '28px', fontWeight: 500, letterSpacing: 0 },
  body1: { fontSize: '14px', lineHeight: '22px', fontWeight: 400, letterSpacing: 0 },
  body2: { fontSize: '12px', lineHeight: '19px', fontWeight: 500, letterSpacing: 0 },
  button: { fontSize: '14px', lineHeight: '22px', fontWeight: 500, letterSpacing: 0, textTransform: 'none' },
  sectionLabel: { fontSize: '14px', lineHeight: '20px', fontWeight: 700, letterSpacing: 0 },
  fieldHint: { fontSize: '11px', lineHeight: '16px', fontWeight: 600, letterSpacing: 0 },
  amountValue: { fontSize: '32px', lineHeight: '38px', fontWeight: 700, letterSpacing: 0 },
  amountCurrency: { fontSize: '20px', lineHeight: '28px', fontWeight: 600, letterSpacing: 0 },
  assistantPromptLabel: { fontSize: '10px', lineHeight: '14px', fontWeight: 750, letterSpacing: '0.065em', textTransform: 'uppercase' },
  assistantPromptTitle: { fontSize: '15px', lineHeight: '21px', fontWeight: 750, letterSpacing: '-0.015em' },
  assistantMessage: { fontSize: '14px', lineHeight: '24px', fontWeight: 500, letterSpacing: 0 },
  loanTitle: { display: 'block', fontSize: '17px', lineHeight: '24px', fontWeight: 750, letterSpacing: '-0.015em' },
  loanMetric: { display: 'block', fontSize: '20px', lineHeight: '28px', fontWeight: 750, letterSpacing: '-0.02em' },
  loanMetricCompact: { display: 'block', fontSize: '16px', lineHeight: '22px', fontWeight: 750, letterSpacing: '-0.015em' },
  loanMeta: { display: 'block', fontSize: '12px', lineHeight: '18px', fontWeight: 650, letterSpacing: 0 },
  cardTitle: { display: 'block', fontSize: '16px', lineHeight: '22px', fontWeight: 800, letterSpacing: '-0.012em' },
  cardSubtitle: { display: 'block', fontSize: '12px', lineHeight: '18px', fontWeight: 600, letterSpacing: 0 },
  codeSnippet: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '11px', lineHeight: '16px', fontWeight: 500, letterSpacing: 0 },
};
