import { describe, expect, it } from 'vitest';
import { flatten } from './flatten';
import { resources } from './resources';

const namespaces = Object.keys(resources.en) as Array<keyof typeof resources.en>;

describe('locale key parity', () => {
  it.each(namespaces)('ar and en have identical keys in "%s"', (ns) => {
    const enKeys = flatten(resources.en[ns]).map(([k]) => k).sort();
    const arKeys = flatten(resources.ar[ns]).map(([k]) => k).sort();
    expect(arKeys, `missing in ar/${String(ns)}: ${enKeys.filter((k) => !arKeys.includes(k)).join(', ')}
extra in ar/${String(ns)}: ${arKeys.filter((k) => !enKeys.includes(k)).join(', ')}`).toEqual(enKeys);
  });

  it('en and ar contain no empty strings', () => {
    for (const lang of ['en', 'ar'] as const) {
      for (const ns of namespaces) {
        for (const [key, value] of flatten(resources[lang][ns])) {
          expect(typeof value, `${lang}/${String(ns)}:${key} is not a string`).toBe('string');
          expect((value as string).trim().length, `${lang}/${String(ns)}:${key} is empty`).toBeGreaterThan(0);
        }
      }
    }
  });
});
