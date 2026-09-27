import { ReactNode } from 'react';

/**
 * Plain-language explanations for the financial metrics/terminology shown
 * across the dashboard. Centralized here so every card uses the same
 * wording and we have one place to edit copy.
 *
 * Keep these short, jargon-free, and action-oriented.
 */
export const metricExplanations: Record<string, ReactNode> = {
  spendingRatio:
    'How much of your planned budget you have already spent in this cycle, ' +
    'shown as a percentage (actual spending ÷ planned budget).',

  cycleProgress:
    'How far through the current statement you are today, shown as a ' +
    'percentage of days elapsed out of the total cycle length.',

  projectedCycleSpending:
    'An estimate of what your total spending will be by the end of the cycle, ' +
    'based on your pace so far. Compared against your planned budget target.',

  plannedBudget:
    'The total amount you planned to spend across all categories in this cycle.',

  safeDaily:
    'A suggested daily spending limit for the rest of the cycle, calculated from ' +
    'the budget you have left to spend divided by the remaining days.',

  safeDailyBudget:
    'Your remaining flexible (non-essential) budget divided by the days left in ' +
    'the cycle. Try to stay at or below this per day to stay on plan.',

  safeDailyCash:
    'Your available cash/bank balance in your base currency (after essential bills) ' +
    'divided by the days left in the cycle. The most you can actually afford per day.',

  totalBaseEquivalent:
    'The combined balance of all your accounts, converted to your base currency ' +
    'at today\'s display rate so you can see everything in one currency.',

  savingStatus: {
    onTrack:
      'On Track — your projected savings for this cycle meet or exceed your target.',
    warning:
      'Pace Warning — you\'re projected to fall short of your saving target. ' +
      'Slow down spending.',
    overspending:
      'Over Budgeting — at this pace you will miss your saving target by a wide ' +
      'margin. Cut spending now.',
  } as unknown as ReactNode,

  budgetBreakdownPlanned:
    'The amount you allocated to this category for the cycle.',
  budgetBreakdownSpent:
    'What you have actually spent in this category so far this cycle.',
  budgetBreakdownRemaining:
    'Planned minus Spent. Positive means you still have room; ' +
    'negative (red) means you have gone over.',
};
