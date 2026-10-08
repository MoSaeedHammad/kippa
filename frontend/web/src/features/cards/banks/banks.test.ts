import { describe, it, expect } from 'vitest';
import { BANKS, BANK_LIST, getBank, getTier } from './banks';

describe('bank catalog', () => {
  it('every bank has a unique id and at least one tier (except "other")', () => {
    const ids = new Set<string>();
    for (const b of BANK_LIST) {
      expect(ids.has(b.id)).toBe(false);
      ids.add(b.id);
      if (b.id !== 'other') expect(b.tiers.length).toBeGreaterThan(0);
    }
  });

  it('every tier has at least one network and one kind', () => {
    for (const b of BANK_LIST) {
      for (const t of b.tiers) {
        expect(t.networks.length).toBeGreaterThan(0);
        expect(t.kinds.length).toBeGreaterThan(0);
      }
    }
  });

  it('every bank background returns a non-empty css string for both kinds', () => {
    for (const b of BANK_LIST) {
      for (const kind of ['debit', 'credit'] as const) {
        expect(b.background({ kind }).css.length).toBeGreaterThan(0);
      }
    }
  });

  it('logo returns a React node for both kinds', () => {
    for (const b of BANK_LIST) {
      for (const kind of ['debit', 'credit'] as const) {
        expect(b.logo({ kind })).toBeDefined();
      }
    }
  });

  it('HSBC has premier, advance tiers', () => {
    expect(getTier('hsbc', 'premier')).toBeDefined();
    expect(getTier('hsbc', 'advance')).toBeDefined();
  });

  it('NBE and Banque Misr issue Meeza', () => {
    const nbeMeeza = getBank('nbe')!.tiers.some(t => t.networks.includes('meeza'));
    const bmMeeza = getBank('banque-misr')!.tiers.some(t => t.networks.includes('meeza'));
    expect(nbeMeeza && bmMeeza).toBe(true);
  });

  it('getBank returns undefined for unknown bank', () => {
    expect(getBank('does-not-exist')).toBeUndefined();
  });

  it('getTier returns undefined for unknown tier', () => {
    expect(getTier('hsbc', 'nope')).toBeUndefined();
  });

  it('"other" bank has empty tiers', () => {
    expect(BANKS['other'].tiers).toEqual([]);
  });

  it('tier color overrides bank default: gold vs platinum differ', () => {
    const goldBg = BANKS.cib.background({ kind: 'credit', tierId: 'gold' }).css;
    const platinumBg = BANKS.cib.background({ kind: 'credit', tierId: 'platinum' }).css;
    const classicBg = BANKS.cib.background({ kind: 'credit', tierId: 'classic' }).css;
    expect(goldBg).not.toBe(platinumBg);
    expect(goldBg).not.toBe(classicBg);
    // classic falls back to bank brand color
    expect(classicBg).toContain('linear-gradient');
  });

  it('HSBC premier keeps HSBC gradient, advance keeps HSBC gradient', () => {
    const premier = BANKS.hsbc.background({ kind: 'debit', tierId: 'premier' }).css;
    const advance = BANKS.hsbc.background({ kind: 'credit', tierId: 'advance' }).css;
    expect(premier).toMatch(/0e1635|1b213b/); // HSBC debit gradient signature
    expect(advance).toMatch(/7A0A10|4A0205/); // HSBC credit gradient signature
  });

  it('Banque Misr faces are black for credit and gold for debit', () => {
    const credit = BANKS['banque-misr'].background({ kind: 'credit', tierId: 'platinum' }).css;
    const debit = BANKS['banque-misr'].background({ kind: 'debit', tierId: 'gold' }).css;
    expect(credit).toMatch(/060606|232326/); // black credit face signature
    expect(debit).toMatch(/D9B54A|B08A24/); // gold debit face signature
    expect(credit).not.toBe(debit);
  });

  it('every non-other bank has a pattern overlay', () => {
    for (const b of BANK_LIST) {
      if (b.id === 'other') continue;
      const { overlay } = b.background({ kind: 'credit', tierId: 'gold' });
      expect(overlay).toBeDefined();
    }
  });
});
