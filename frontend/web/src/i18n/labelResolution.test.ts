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
// Phase 2 constants maps: accounts.types, activity.actionGroups,
// budgetCycles (analytics/historyCard legends + closeDialog.confirmations),
// notifications.preferences, sharedBalance kinds/directions/status/months,
// reconciliation.reasons. Subtree paths may be nested ('a.b').
const NAMESPACES: Array<{ ns: string; subtrees: readonly string[] }> = [
  { ns: 'appShell', subtrees: SUBTREES },
  { ns: 'dashboard', subtrees: ['metrics'] },
  { ns: 'accounts', subtrees: ['types'] },
  { ns: 'activity', subtrees: ['actionGroups'] },
  { ns: 'budgetCycles', subtrees: ['analytics', 'historyCard', 'closeDialog.confirmations'] },
  { ns: 'notifications', subtrees: ['preferences'] },
  { ns: 'sharedBalance', subtrees: ['kinds', 'directions', 'status', 'months'] },
  { ns: 'reconciliation', subtrees: ['reasons'] },
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
          const namespaceData = resources[language][namespace] as Parameters<typeof flatten>[0];
          // Subtree paths may be nested (e.g. 'closeDialog.confirmations').
          const subtreeData = subtree.split('.').reduce<Parameters<typeof flatten>[0] | undefined>(
            (node, segment) =>
              node !== null && typeof node === 'object'
                ? (node as Record<string, Parameters<typeof flatten>[0]>)[segment]
                : undefined,
            namespaceData,
          );
          expect(subtreeData, `${ns}.${subtree} should exist in ${language} resources`).toBeTruthy();
          const keys = flatten(subtreeData!).map(([k]) => `${subtree}.${k}`);
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
