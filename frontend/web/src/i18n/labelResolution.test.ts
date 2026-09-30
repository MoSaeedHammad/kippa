import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { flatten } from './flatten';
import { resources } from './resources';

/**
 * Regression guard: every nav/section/page-title key stored in component
 * constants must resolve to real copy at runtime (not echo the raw key).
 * Constants store bare sub-keys (e.g. 'dashboard') which components resolve
 * via t(`nav.${key}`); probing every JSON leaf under each subtree covers them.
 */
const SUBTREES = ['nav', 'sections', 'pageTitles'] as const;

describe('appShell label resolution', () => {
  it.each(['en', 'ar'] as const)('every %s subtree key resolves to copy, not the raw key', (lng) => {
    return i18n.changeLanguage(lng).then(() => {
      for (const subtree of SUBTREES) {
        const keys = flatten(resources[lng].appShell[subtree]).map(([k]) => `${subtree}.${k}`);
        expect(keys.length, `appShell.${subtree} should not be empty`).toBeGreaterThan(0);
        for (const key of keys) {
          // The probe is intentionally dynamic: keys come from the JSON itself,
          // so `t` is narrowed to a plain (key, ns) signature rather than the
          // strict per-key overloads used by feature components.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const probe = i18n.t.bind(i18n) as (key: string, opts?: { ns: string }) => string;
          const resolved = probe(key, { ns: 'appShell' });
          expect(resolved, `${lng}:appShell:${key} echoed the raw key`).not.toBe(key);
          expect(String(resolved).trim().length).toBeGreaterThan(0);
        }
      }
    });
  });
});
