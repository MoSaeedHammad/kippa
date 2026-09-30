import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { flatten } from './flatten';
import { resources } from './resources';

/**
 * Regression guard: every key stored in component/constants maps must resolve
 * to real copy at runtime (not echo the raw key). Constants store bare
 * sub-keys (e.g. 'dashboard') which components resolve via t(`nav.${key}`);
 * probing every JSON leaf under each subtree covers them.
 */
const SUBTREES = ['nav', 'sections', 'pageTitles'] as const;

// dashboard.metrics leaves back the shared metricExplanationKeys constants map.
const NAMESPACES: Array<{ ns: string; subtrees: readonly string[] }> = [
  { ns: 'appShell', subtrees: SUBTREES },
  { ns: 'dashboard', subtrees: ['metrics'] },
];

describe('constants label resolution', () => {
  it.each(NAMESPACES.flatMap(({ ns }) => ['en', 'ar'].map(lng => [ns, lng])))(
    'every %s subtree key resolves to copy, not the raw key (%s)',
    (ns, lng) => {
      const language = lng as 'en' | 'ar';
      const namespace = ns as keyof typeof resources.en;
      const subtrees = NAMESPACES.find(entry => entry.ns === ns)!.subtrees;
      return i18n.changeLanguage(language).then(() => {
        for (const subtree of subtrees) {
          const subtreeData = resources[language][namespace] as Record<string, Record<string, string>>;
          const keys = flatten(subtreeData[subtree]).map(([k]) => `${subtree}.${k}`);
          expect(keys.length, `${ns}.${subtree} should not be empty`).toBeGreaterThan(0);
          for (const key of keys) {
            // The probe is intentionally dynamic: keys come from the JSON itself,
            // so `t` is narrowed to a plain (key, ns) signature rather than the
            // strict per-key overloads used by feature components.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const probe = i18n.t.bind(i18n) as (key: string, opts?: { ns: string }) => string;
            const resolved = probe(key, { ns });
            expect(resolved, `${language}:${ns}:${key} echoed the raw key`).not.toBe(key);
            expect(String(resolved).trim().length).toBeGreaterThan(0);
          }
        }
      });
    },
  );
});
