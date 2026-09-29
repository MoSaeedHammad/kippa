import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineAiTool, executeConfirmedTool, executeValidatedTool, parseToolInput } from './toolRegistry';
import { createAiToolRegistry } from './readTools';

const context = { householdId: 'household-1', userId: 'user-1' };

describe('AI tool validation boundary', () => {
  it('executes a valid read tool with trusted context', async () => {
    const execute = vi.fn(async ({ year }: { year: number }) => ({ year }));
    const definition = defineAiTool({
      description: 'test', inputSchema: z.object({ year: z.number().int() }).strict(), risk: 'read' as const, execute,
    });
    await expect(executeValidatedTool(definition, { year: 2026 }, context)).resolves.toEqual({ year: 2026 });
    expect(execute).toHaveBeenCalledWith({ year: 2026 }, context);
  });

  it('rejects hallucinated fields before execution', async () => {
    const execute = vi.fn(async () => ({}));
    const definition = defineAiTool({
      description: 'test', inputSchema: z.object({ year: z.number().int() }).strict(), risk: 'read' as const, execute,
    });
    await expect(executeValidatedTool(definition, { year: 2026, householdId: 'attacker-household' }, context)).rejects.toThrow('Invalid tool input');
    expect(execute).not.toHaveBeenCalled();
  });

  it('refuses write tools outside the confirmed-action pipeline', async () => {
    const execute = vi.fn(async () => ({}));
    const definition = defineAiTool({
      description: 'test', inputSchema: z.object({}).strict(), risk: 'write' as const, execute,
    });
    await expect(executeValidatedTool(definition, {}, context)).rejects.toThrow('confirmed-action pipeline');
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes a validated write exactly once through the confirmed-action pipeline', async () => {
    const execute = vi.fn(async ({ value }: { value: string }) => ({ value }));
    const definition = defineAiTool({ description: 'test', inputSchema: z.object({ value: z.string().min(1) }).strict(), risk: 'write' as const, execute });
    await expect(executeConfirmedTool(definition, { value: 'confirmed' }, context)).resolves.toEqual({ value: 'confirmed' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('requires authenticated household context', async () => {
    const definition = defineAiTool({
      description: 'test', inputSchema: z.object({}).strict(), risk: 'read' as const, execute: async () => ({}),
    });
    await expect(executeValidatedTool(definition, {}, { householdId: '', userId: '' })).rejects.toThrow('Authenticated space context');
  });
});

describe('AI capability registry', () => {
  const registry = createAiToolRegistry();

  it('covers every current app capability family', () => {
    expect(Object.keys(registry)).toEqual(expect.arrayContaining([
      'getDashboardSummary', 'listAccounts', 'createAccount', 'updateAccount',
      'listCategories', 'createCategory', 'updateCategory',
      'listTransactions', 'createTransaction', 'updateTransaction', 'voidTransaction',
      'listCards', 'createDebitCard', 'createCreditCard', 'updateCard', 'payCreditCard', 'listCardStatements', 'deleteCardStatement',
      'listBudgetCycles', 'getCyclePlan', 'getCycleAnalytics', 'getCategoryTrend', 'createBudgetCycle', 'updateBudgetCycleStatus', 'saveBudgetAllocation', 'saveBudgetAllocationsBatch', 'saveExpectedIncome',
      'listReconciliations', 'reconcileAccount',
      'listPendingTransactions', 'listResolvedPendingTransactions', 'approvePendingTransaction', 'discardPendingTransaction', 'restoreDiscardedPendingTransaction',
      'getNotificationSettings', 'updateNotificationSettings', 'enablePushNotifications', 'disablePushNotifications',
      'listMyHouseholds', 'listHouseholdMembers', 'createHousehold', 'switchHousehold', 'requestHouseholdJoin', 'decideHouseholdJoinRequest', 'leaveHousehold',
      'listMessageConnections', 'createMessageConnection', 'revokeMessageConnection',
      'listMemories', 'rememberUserContext', 'forgetUserMemory', 'renderChart',
    ]));
  });

  it('rejects malformed chart series before rendering', async () => {
    await expect(parseToolInput(registry.renderChart, { type: 'bar', title: 'Spend', labels: ['Food', 'Rent'], series: [{ label: 'EGP', data: [100] }] })).rejects.toThrow('one value per label');
  });

  it('rejects unbalanced same-currency transfers before proposal', async () => {
    await expect(parseToolInput(registry.createTransaction, { type: 'transfer', date: '2026-08-02', lines: [{ accountId: 'a', signedAmount: -100, currency: 'EGP' }, { accountId: 'b', signedAmount: 90, currency: 'EGP' }] })).rejects.toThrow('balance to zero');
  });
});
