import { HSBC_GRADIENT_CREDIT, HSBC_GRADIENT_DEBIT } from './hsbcTheme';

/**
 * Bank card gradient resolution: universal tier gradients + per-bank brand
 * gradients.
 *
 * `tierGradient(tierId, bankId)` resolves which CSS gradient to paint:
 *  1. Universal tier gradient (gold/platinum/titanium/...) overrides brand color.
 *  2. HSBC special tiers (premier/advance) keep their existing HSBC gradients.
 *  3. Otherwise fall back to the bank's dark brand-color gradient.
 */

// ---------------------------------------------------------------------------
// Universal tier gradients (apply to any bank)
// ---------------------------------------------------------------------------
const TIER_GRADIENTS: Record<string, string> = {
  gold: 'linear-gradient(135deg, #8B6914 0%, #B8860B 30%, #D4AF37 60%, #F5E6A8 100%)',
  platinum: 'linear-gradient(135deg, #6A6A75 0%, #8A8A95 30%, #C0C0C8 60%, #E8E8F0 100%)',
  titanium: 'linear-gradient(135deg, #1A1A1E 0%, #2A2A2E 50%, #3A3A40 100%)',
  world: 'linear-gradient(135deg, #0D0D2E 0%, #1A1A4E 50%, #2E2E6E 100%)',
  signature: 'linear-gradient(135deg, #000000 0%, #0D0D0D 50%, #1A1A1A 100%)',
  infinite: 'linear-gradient(135deg, #000000 0%, #050505 60%, #0A0A0A 100%)',
  black: 'linear-gradient(135deg, #000000 0%, #0A0A0A 60%, #1A1A1A 100%)',
};

// ---------------------------------------------------------------------------
// Bank default brand-color gradients (used when no tier override applies)
// ---------------------------------------------------------------------------
const BANK_DEFAULT_GRADIENT: Record<string, string> = {
  hsbc: HSBC_GRADIENT_DEBIT,
  cib: 'linear-gradient(135deg, #0B2D4A 0%, #1F4F7A 100%)',
  nbe: 'linear-gradient(135deg, #143A17 0%, #2E7D32 100%)',
  'banque-misr': 'linear-gradient(135deg, #5A1212 0%, #C62828 100%)',
  qnb: 'linear-gradient(135deg, #2A1240 0%, #5B2C83 100%)',
  'arab-bank': 'linear-gradient(135deg, #0B3A66 0%, #1976D2 100%)',
  adcb: 'linear-gradient(135deg, #5A1212 0%, #D32F2F 100%)',
  aaib: 'linear-gradient(135deg, #0A2E5C 0%, #1565C0 100%)',
  fabmisr: 'linear-gradient(135deg, #300D44 0%, #6A1B9A 100%)',
  egbank: 'linear-gradient(135deg, #00332C 0%, #00695C 100%)',
  other: 'linear-gradient(135deg, #2A2E3A 0%, #495167 100%)',
};

export function tierGradient(tierId: string | undefined, bankId: string): string {
  // 1. Universal tier gradient
  if (tierId && TIER_GRADIENTS[tierId]) {
    return TIER_GRADIENTS[tierId];
  }

  // 2. HSBC special tiers keep existing HSBC gradients
  if (bankId === 'hsbc') {
    if (tierId === 'premier') return HSBC_GRADIENT_DEBIT;
    if (tierId === 'advance') return HSBC_GRADIENT_CREDIT;
  }

  // 3. Bank default brand gradient
  return BANK_DEFAULT_GRADIENT[bankId] ?? BANK_DEFAULT_GRADIENT.other;
}

// ---------------------------------------------------------------------------
// Banque Misr signature card faces (black credit / gold debit, per BM brand)
// ---------------------------------------------------------------------------
export const BANQUE_MISR_GRADIENT_CREDIT =
  'linear-gradient(150deg, #060606 0%, #232326 42%, #101013 68%, #050505 100%)';
export const BANQUE_MISR_GRADIENT_DEBIT =
  'linear-gradient(150deg, #7A5A14 0%, #B08A24 35%, #D9B54A 68%, #EED98F 100%)';
