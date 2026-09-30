import type dashboardEn from '@/i18n/locales/en/dashboard.json';

/**
 * Plain-language explanations for the financial metrics/terminology shown
 * across the dashboard. Centralized here so every card uses the same
 * wording and we have one place to edit copy.
 *
 * The map stores bare keys into the `dashboard` namespace's `metrics`
 * subtree; display sites resolve them with t(`metrics.${key}`) so the copy
 * is localized. Keys are typecheck-validated against the en JSON.
 *
 * Keep these short, jargon-free, and action-oriented.
 */
type MetricExplanationKey = keyof typeof dashboardEn['metrics'];

export const metricExplanationKeys = {
  spendingRatio: 'spendingRatio',
  cycleProgress: 'cycleProgress',
  projectedCycleSpending: 'projectedCycleSpending',
  plannedBudget: 'plannedBudget',
  safeDaily: 'safeDaily',
  safeDailyBudget: 'safeDailyBudget',
  safeDailyCash: 'safeDailyCash',
  totalBaseEquivalent: 'totalBaseEquivalent',
  savingOnTrack: 'savingOnTrack',
  savingWarning: 'savingWarning',
  savingOverspending: 'savingOverspending',
  budgetBreakdownPlanned: 'budgetBreakdownPlanned',
  budgetBreakdownSpent: 'budgetBreakdownSpent',
  budgetBreakdownRemaining: 'budgetBreakdownRemaining',
} as const satisfies Record<string, MetricExplanationKey>;
