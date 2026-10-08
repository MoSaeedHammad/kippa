import { describe, expect, it } from 'vitest';
import { PREDEFINED_MESSAGE_TEMPLATES } from './predefinedTemplates';

const DECLARED_GROUPS = [
  'amountGroup', 'currencyGroup', 'dateGroup', 'merchantGroup', 'last4Group', 'descriptionGroup', 'referenceGroup',
] as const;

describe('PREDEFINED_MESSAGE_TEMPLATES', () => {
  it('every rule compiles, matches its sample and declares real groups', () => {
    for (const entry of PREDEFINED_MESSAGE_TEMPLATES) {
      let regex: RegExp;
      expect(() => {
        regex = new RegExp(entry.pattern, 'i');
      }, `${entry.name}: pattern must compile`).not.toThrow();

      const match = regex!.exec(entry.sample);
      expect(match, `${entry.name}: pattern must match its own sample`).not.toBeNull();
      const groups = Object.keys(match!.groups ?? {});

      for (const field of DECLARED_GROUPS) {
        const group = entry[field];
        if (group) {
          expect(groups, `${entry.name}: group "${group}" (${field}) must exist in the pattern`).toContain(group);
        }
      }
      expect(groups, `${entry.name}: the amount group is required`).toContain(entry.amountGroup);
    }
  });

  it('extracts amount, merchant and reference from the instapay IPN sample', () => {
    const entry = PREDEFINED_MESSAGE_TEMPLATES.find((candidate) => candidate.name.includes('IPN inward'))!;
    const match = new RegExp(entry.pattern, 'i').exec(entry.sample)!;
    expect(match.groups!.amount).toBe('225.00');
    expect(match.groups!.merchant).toBe('person314271@instapay');
    expect(match.groups!.reference).toBe('e33925a9');
  });
});
