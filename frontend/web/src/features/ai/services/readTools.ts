import { tool } from 'ai';
import { z } from 'zod';
import type { Account, Category, LedgerLine, NotificationSettings } from '@kippa/domain';
import { ledgerLib } from '@/libs/ledger';
import { transactionsLib } from '@/libs/transactions';
import { cyclesLib } from '@/libs/cycles';
import { cardsLib } from '@/libs/cards';
import { messageIngestionLib } from '@/libs/messageIngestion';
import { auditLogLib } from '@/libs/auditLog';
import { authLib } from '@/libs/auth';
import { aiMemoryService } from './memory';
import { calculateAccountBalances, getPostedLedgerLines } from '@/libs/financeCalculations';
import { currencyLib } from '@/libs/currency';
import { computeDashboard } from '@/libs/selectors';
import { calculateCategoryTrends, calculateCycleData } from '@/libs/budgetAnalytics';
import { BANK_LIST } from '@/features/cards/banks/banks';
import { dbLib } from '@/libs/db';
import { calculateCardActivity } from '@/libs/cardActivity';
import { computeCardSummary, currentCyclePurchases } from '@/libs/cardSelectors';
import { loansLib, loanInputSchema } from '@/libs/loans';
import { getLoanProgress } from '@/libs/loanCalculations';
import type { AiChartSpec, PendingAiAction } from '../types';
import { defineAiTool, executeConfirmedTool, executeValidatedTool, parseToolInput, type AiToolContext, type AiToolRegistry } from './toolRegistry';

const emptyInput = z.object({}).strict();
const id = z.string().trim().min(1).max(128);
const name = z.string().trim().min(1).max(80);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const money = z.number().positive().max(1_000_000_000);
const signedMoney = z.number().min(-1_000_000_000).max(1_000_000_000).refine(value => value !== 0);
const isoDate = z.iso.date();
const cardNetwork = z.enum(['visa', 'mastercard', 'meeza', 'other']);
const cardDetails = {
  name,
  last4: z.string().trim().max(4).optional(),
  network: cardNetwork.optional(),
  bankId: z.string().trim().min(1).max(80),
  tierId: z.string().trim().max(80).optional(),
  expiryMonth: z.number().int().min(1).max(12).optional(),
  expiryYear: z.number().int().min(2020).max(2200).optional(),
  currency,
};
const allocationInput = z.object({ budgetCycleId: id, categoryId: id, plannedAmount: z.number().min(0).max(1_000_000_000), currency, carryLeftover: z.boolean().default(false), notes: z.string().trim().max(240).nullable().optional() }).strict();
const chartSchema = z.object({
  type: z.enum(['bar', 'line', 'pie']),
  title: z.string().trim().min(1).max(100),
  labels: z.array(z.string().trim().min(1).max(40)).min(1).max(50),
  series: z.array(z.object({ label: z.string().trim().min(1).max(40), data: z.array(z.number().min(-1_000_000_000).max(1_000_000_000)).min(1).max(50) }).strict()).min(1).max(4),
}).strict().superRefine((value, ctx) => {
  if (value.type === 'pie' && value.series.length !== 1) ctx.addIssue({ code: 'custom', message: 'Pie charts require exactly one series.' });
  value.series.forEach((series, index) => {
    if (series.data.length !== value.labels.length) ctx.addIssue({ code: 'custom', path: ['series', index, 'data'], message: 'Every series must have one value per label.' });
  });
});

const auditUser = (context: AiToolContext) => ({ uid: context.userId, displayName: context.userDisplayName || 'Kippa user', photoURL: context.userPhotoURL });

async function requireAccount(householdId: string, accountId: string): Promise<Account> {
  const account = (await ledgerLib.getAccounts(householdId)).find(item => item.id === accountId);
  if (!account) throw new Error('Account not found in this shared account.');
  return account;
}

async function requireCategory(householdId: string, categoryId: string): Promise<Category> {
  const category = (await ledgerLib.getCategories(householdId)).find(item => item.id === categoryId);
  if (!category) throw new Error('Category not found in this shared account.');
  return category;
}

export function createAiToolRegistry(): AiToolRegistry {
  return {
    getFinancialSnapshot: defineAiTool({
      description: 'Get current active account balances and household base currency. Use for balance and available-money questions.', inputSchema: emptyInput, risk: 'read',
      async execute(_, context) {
        const [accounts, transactions, ledgerLines, household] = await Promise.all([ledgerLib.getAccounts(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>, ledgerLib.getHouseholdInfo(context.householdId)]);
        const balances = calculateAccountBalances(accounts, transactions, ledgerLines);
        return { asOf: new Date().toISOString(), baseCurrency: household?.baseCurrency ?? null, accounts: accounts.filter(account => account.isActive).map(account => ({ id: account.id, name: account.name, type: account.type, currency: account.currency, balance: Number((balances[account.id] ?? 0).toFixed(2)) })) };
      },
    }),
    listAccounts: defineAiTool({ description: 'List household accounts, including inactive accounts and stable IDs needed by action tools.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => ledgerLib.getAccounts(context.householdId) }),
    listCategories: defineAiTool({ description: 'List active income and expense categories with stable IDs needed by transaction and budget tools.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => ledgerLib.getCategories(context.householdId) }),
    listLoans: defineAiTool({ description: 'List every loan contract, its fixed schedule, paying account, and status. Loans are direct commitments, not categories.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => loansLib.getLoans(context.householdId) }),
    getLoanProgress: defineAiTool({ description: 'Get accurate paid, remaining, next due, payoff, and account-readiness information for one loan.', inputSchema: z.object({ loanId: id }).strict(), risk: 'read', async execute({ loanId }, context) { const [loans, transactions, lines, accounts] = await Promise.all([loansLib.getLoans(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>, ledgerLib.getAccounts(context.householdId)]); const loan = loans.find(item => item.id === loanId); if (!loan) throw new Error('Loan not found.'); const progress = getLoanProgress(loan, transactions, lines); const balances = calculateAccountBalances(accounts, transactions, lines); const accountBalance = balances[loan.paymentAccountId] ?? 0; return { loan, ...progress, payments: progress.payments.map(payment => ({ transactionId: payment.transaction.id, date: payment.transaction.date, installmentNumber: payment.transaction.loanInstallmentNumber, amount: payment.amount })), accountBalance, accountShortfall: Math.max(0, loan.installmentAmount - accountBalance) }; } }),
    simulateLoanExtraPayment: defineAiTool({ description: 'Simulate how a one-time extra payment changes a fixed loan payoff. This is informational and does not write data.', inputSchema: z.object({ loanId: id, extraAmount: money }).strict(), risk: 'read', async execute({ loanId, extraAmount }, context) { const [loans, transactions, lines] = await Promise.all([loansLib.getLoans(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>]); const loan = loans.find(item => item.id === loanId); if (!loan) throw new Error('Loan not found.'); const progress = getLoanProgress(loan, transactions, lines); const newRemaining = Math.max(0, progress.remainingAmount - extraAmount); const installmentsSaved = Math.max(0, progress.remainingInstallments - Math.ceil(newRemaining / loan.installmentAmount)); return { currentRemaining: progress.remainingAmount, extraAmount: Math.min(extraAmount, progress.remainingAmount), newRemaining, installmentsSaved, estimatedRemainingInstallments: Math.ceil(newRemaining / loan.installmentAmount), note: 'This assumes the lender applies extra money directly to the remaining fixed contract amount; confirm early-payment rules with the lender.' }; } }),
    listTransactions: defineAiTool({
      description: 'List recent transactions, optionally for one statement, date range, or status. Returns matching ledger lines.',
      inputSchema: z.object({ cycleId: id.optional(), startDate: isoDate.optional(), endDate: isoDate.optional(), status: z.enum(['posted', 'voided', 'draft']).optional(), limit: z.number().int().min(1).max(100).default(30) }).strict().refine(value => !value.startDate || !value.endDate || value.startDate <= value.endDate, { message: 'startDate must be on or before endDate' }), risk: 'read',
      async execute({ cycleId, startDate, endDate, status, limit }, context) {
        const [transactions, lines] = await Promise.all([ledgerLib.getTransactions(context.householdId, cycleId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>]);
        const selected = transactions.filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate) && (!status || item.status === status)).slice(0, limit);
        const selectedIds = new Set(selected.map(item => item.id));
        return { transactions: selected, ledgerLines: lines.filter(line => selectedIds.has(line.transactionId)) };
      },
    }),
    getYearlyIncomeAndSpending: defineAiTool({
      description: 'Calculate posted income and expense totals for a calendar year. Transfers and adjustments are excluded.', inputSchema: z.object({ year: z.number().int().min(2000).max(2100) }).strict(), risk: 'read',
      async execute({ year }, context) {
        const [transactions, ledgerLines] = await Promise.all([ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>]);
        const relevant = transactions.filter(transaction => transaction.status === 'posted' && transaction.date.startsWith(`${year}-`) && (transaction.type === 'income' || transaction.type === 'expense'));
        const relevantIds = new Set(relevant.map(transaction => transaction.id));
        const transactionById = new Map(relevant.map(transaction => [transaction.id, transaction]));
        const totals: Record<string, { income: number; spending: number }> = {};
        for (const line of getPostedLedgerLines(relevant, ledgerLines).filter(line => relevantIds.has(line.transactionId))) { const transaction = transactionById.get(line.transactionId); if (!transaction) continue; const bucket = totals[line.currency] ?? { income: 0, spending: 0 }; if (transaction.type === 'income' && line.signedAmount > 0) bucket.income += line.signedAmount; if (transaction.type === 'expense' && line.signedAmount < 0) bucket.spending += Math.abs(line.signedAmount); totals[line.currency] = bucket; }
        return { year, totals };
      },
    }),
    getCategoryPerformance: defineAiTool({
      description: 'Get posted spending totals by expense category for an explicit date period.',
      inputSchema: z.object({ startDate: isoDate, endDate: isoDate, categoryName: name.optional() }).strict().refine(value => value.startDate <= value.endDate, { message: 'startDate must be on or before endDate' }), risk: 'read',
      async execute({ startDate, endDate, categoryName }, context) {
        const [categories, transactions, ledgerLines] = await Promise.all([ledgerLib.getCategories(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>]);
        const normalized = categoryName?.toLocaleLowerCase(); const selected = normalized ? categories.filter(category => category.name.toLocaleLowerCase() === normalized) : categories.filter(category => category.type === 'expense');
        if (normalized && selected.length === 0) throw new Error(`No active category named "${categoryName}" exists.`);
        const selectedIds = new Set(selected.map(category => category.id)); const relevant = transactions.filter(transaction => transaction.status === 'posted' && transaction.type === 'expense' && transaction.date >= startDate && transaction.date <= endDate && !!transaction.categoryId && selectedIds.has(transaction.categoryId));
        const transactionById = new Map(relevant.map(transaction => [transaction.id, transaction])); const categoriesById = new Map(categories.map(category => [category.id, category])); const totals: Record<string, Record<string, number>> = {};
        for (const line of getPostedLedgerLines(relevant, ledgerLines)) { const transaction = transactionById.get(line.transactionId); if (!transaction?.categoryId || line.signedAmount >= 0) continue; const categoryNameValue = categoriesById.get(transaction.categoryId)?.name ?? 'Unknown'; totals[categoryNameValue] ??= {}; totals[categoryNameValue][line.currency] = (totals[categoryNameValue][line.currency] ?? 0) + Math.abs(line.signedAmount); }
        return { startDate, endDate, totals };
      },
    }),
    getDashboardSummary: defineAiTool({
      description: 'Get the same actionable current-cycle summary used by the dashboard: balances converted to base currency, spending, income, savings status, safe daily spend, and category status.', inputSchema: emptyInput, risk: 'read',
      async execute(_, context) {
        const [accounts, categories, cycles, transactions, ledgerLines, allocations, expectedIncomes, household, loans] = await Promise.all([ledgerLib.getAccounts(context.householdId), ledgerLib.getCategories(context.householdId), cyclesLib.getCycles(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>, cyclesLib.getAllBudgetAllocations(context.householdId), cyclesLib.getAllExpectedIncomes(context.householdId), ledgerLib.getHouseholdInfo(context.householdId), loansLib.getLoans(context.householdId)]);
        const activeCycle = cycles.find(cycle => cycle.status === 'open') ?? null; const baseCurrency = household?.baseCurrency ?? 'EGP'; const rates = await currencyLib.getRatesToBase(baseCurrency, accounts.map(account => account.currency));
        return computeDashboard(accounts, transactions, ledgerLines, categories, activeCycle, allocations.filter(item => item.budgetCycleId === activeCycle?.id), expectedIncomes.filter(item => item.budgetCycleId === activeCycle?.id), rates, baseCurrency, loans);
      },
    }),
    getCycleAnalytics: defineAiTool({
      description: 'Get income, expense, planned-budget, expected-income, and savings totals across all statements. Use this before rendering cycle trend charts.', inputSchema: emptyInput, risk: 'read',
      async execute(_, context) { const [accounts, cycles, transactions, ledgerLines, allocations, expectedIncomes, household, loans] = await Promise.all([ledgerLib.getAccounts(context.householdId), cyclesLib.getCycles(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>, cyclesLib.getAllBudgetAllocations(context.householdId), cyclesLib.getAllExpectedIncomes(context.householdId), ledgerLib.getHouseholdInfo(context.householdId), loansLib.getLoans(context.householdId)]); const baseCurrency = household?.baseCurrency ?? 'EGP'; const rates = await currencyLib.getRatesToBase(baseCurrency, accounts.map(account => account.currency)); return { baseCurrency, cycles: calculateCycleData(cycles, transactions, ledgerLines, allocations, expectedIncomes, baseCurrency, rates, loans) }; },
    }),
    getCategoryTrend: defineAiTool({
      description: 'Get one expense category spending trend across statements. Use before rendering a category trend chart.', inputSchema: z.object({ categoryId: id }).strict(), risk: 'read',
      async execute({ categoryId }, context) { await requireCategory(context.householdId, categoryId); const [accounts, cycles, transactions, ledgerLines, household] = await Promise.all([ledgerLib.getAccounts(context.householdId), cyclesLib.getCycles(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>, ledgerLib.getHouseholdInfo(context.householdId)]); const baseCurrency = household?.baseCurrency ?? 'EGP'; const rates = await currencyLib.getRatesToBase(baseCurrency, accounts.map(account => account.currency)); return { baseCurrency, trend: calculateCategoryTrends(cycles, transactions, ledgerLines, categoryId, baseCurrency, rates) }; },
    }),
    listBudgetCycles: defineAiTool({ description: 'List all statements and their statuses.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => cyclesLib.getCycles(context.householdId) }),
    getCyclePlan: defineAiTool({ description: 'Get allocations and expected incomes for a statement.', inputSchema: z.object({ cycleId: id }).strict(), risk: 'read', async execute({ cycleId }, context) { const [allocations, expectedIncomes] = await Promise.all([cyclesLib.getBudgetAllocations(context.householdId, cycleId), cyclesLib.getExpectedIncomes(context.householdId, cycleId)]); return { allocations, expectedIncomes }; } }),
    listCards: defineAiTool({ description: 'List debit and credit cards and their linked accounts.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => cardsLib.getCards(context.householdId) }),
    listSupportedBanks: defineAiTool({ description: 'List bank, card-tier, network, and card-kind options supported by the card UI. Use before proposing card creation.', inputSchema: emptyInput, risk: 'read', execute: async () => BANK_LIST.map(bank => ({ id: bank.id, name: bank.name, tiers: bank.tiers })) }),
    listCardStatements: defineAiTool({ description: 'List card statements, optionally for one card.', inputSchema: z.object({ cardId: id.optional() }).strict(), risk: 'read', execute: ({ cardId }, context) => cardsLib.getStatements(context.householdId, cardId) }),
    getCardDetails: defineAiTool({ description: 'Get the same debt, available-credit, utilization, statement, due-date, current-purchases, and charge-payment details shown by the card UI.', inputSchema: z.object({ cardId: id }).strict(), risk: 'read', async execute({ cardId }, context) { const [cards, statements, accounts, transactions, ledgerLines, cycles] = await Promise.all([cardsLib.getCards(context.householdId), cardsLib.getStatements(context.householdId, cardId), ledgerLib.getAccounts(context.householdId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>, cyclesLib.getCycles(context.householdId)]); const card = cards.find(item => item.id === cardId); if (!card) throw new Error('Card not found.'); const balances = calculateAccountBalances(accounts, transactions, ledgerLines); const lastStatement = statements[0] ?? null; const summary = computeCardSummary(card, balances[card.parentAccountId] ?? 0, lastStatement, statements); summary.currentCyclePurchases = currentCyclePurchases(ledgerLines, transactions, card.parentAccountId, lastStatement); return { card, summary, activity: calculateCardActivity(card.parentAccountId, transactions, ledgerLines, cycles) }; } }),
    listReconciliations: defineAiTool({ description: 'List account reconciliation history.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => ledgerLib.getReconciliations(context.householdId) }),
    getNotificationSettings: defineAiTool({ description: 'Get the current user notification preferences.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => ledgerLib.getNotificationSettings(context.householdId, context.userId) }),
    getPushNotificationStatus: defineAiTool({ description: 'Get whether this browser supports notifications and its current permission state.', inputSchema: emptyInput, risk: 'read', execute: async () => ({ supported: typeof Notification !== 'undefined', permission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission }) }),
    listPendingTransactions: defineAiTool({ description: 'List pending imported financial messages waiting for review.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => messageIngestionLib.getPending(context.householdId) }),
    getRecentActivity: defineAiTool({ description: 'Get recent household audit activity.', inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(20) }).strict(), risk: 'read', execute: ({ limit }, context) => auditLogLib.getRecentLogs(context.householdId, limit) }),
    listMyHouseholds: defineAiTool({ description: 'List households the current user belongs to and identify the active household.', inputSchema: emptyInput, risk: 'read', async execute(_, context) { const profile = await authLib.getUserProfile(context.userId); const householdIds = profile?.householdIds ?? []; const households = await Promise.all(householdIds.map(householdId => ledgerLib.getHouseholdInfo(householdId))); return { activeHouseholdId: profile?.householdId ?? null, households: households.filter(Boolean) }; } }),
    listHouseholdMembers: defineAiTool({ description: 'List members of the active household. Owner authorization is enforced by the existing application service.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => authLib.listHouseholdMembers(context.userId, context.householdId) }),
    listPendingJoinRequests: defineAiTool({ description: 'List pending requests to join the active household. Only the shared account owner can read them.', inputSchema: emptyInput, risk: 'read', async execute(_, context) { const requests = await dbLib.getDocs(context.householdId, 'joinRequests', [{ field: 'status', op: '==', value: 'pending' }]); return requests.sort((a, b) => Number(b.requestedAt ?? 0) - Number(a.requestedAt ?? 0)); } }),
    listMessageConnections: defineAiTool({ description: 'List iPhone message-ingestion connections. Tokens are never returned.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => messageIngestionLib.listCredentials(context.householdId) }),
    renderChart: defineAiTool({ description: 'Render a bar, line, or pie chart inside the conversation. Only use values returned by financial data tools in this turn; never invent chart data. Prefer bar for comparisons, line for time trends, and pie only for a small part-to-whole breakdown.', inputSchema: chartSchema, risk: 'read', execute: async input => input }),
    listMemories: defineAiTool({ description: 'List the durable facts, preferences, goals, decisions, and corrections Kip currently remembers about this user. Use when the user asks what you remember or before correcting/forgetting a memory.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => aiMemoryService.listActive(context.householdId, context.userId) }),
    rememberUserContext: defineAiTool({
      description: 'Save one durable, explicitly user-provided fact, preference, goal, decision, or correction for future conversations. Do not store transient requests, current balances, transaction facts already in Kippa, secrets, credentials, inferred traits, or assistant guesses. Use replacesMemoryId when correcting an existing memory.',
      inputSchema: z.object({ kind: z.enum(['fact', 'preference', 'goal', 'decision', 'correction', 'pattern', 'outcome']), content: z.string().trim().min(3).max(500), replacesMemoryId: id.optional() }).strict(), risk: 'memory',
      execute: ({ kind, content, replacesMemoryId }, context) => aiMemoryService.remember({ householdId: context.householdId, userId: context.userId, kind, content, replacesMemoryId, sourceMessageIds: context.sourceMessageIds ?? [] }),
    }),
    forgetUserMemory: defineAiTool({ description: 'Forget one saved memory only when the user explicitly asks to forget it. Call listMemories first to obtain the exact memory ID.', inputSchema: z.object({ memoryId: id }).strict(), risk: 'memory', execute: ({ memoryId }, context) => aiMemoryService.forget(context.householdId, context.userId, memoryId) }),

    createAccount: defineAiTool({ description: 'Propose creating a financial account. Requires user confirmation.', inputSchema: z.object({ name, type: z.enum(['running', 'savings', 'cash', 'wallet', 'credit', 'adjustment']), currency, sortOrder: z.number().int().min(0).max(10_000).default(0) }).strict(), risk: 'write', confirmation: input => `Create ${input.name} (${input.currency})`, execute: (input, context) => ledgerLib.createAccount(context.householdId, { ...input, isActive: true }, auditUser(context)) }),
    updateAccount: defineAiTool({
      description: 'Propose changing an existing account. Requires user confirmation.', inputSchema: z.object({ accountId: id, name: name.optional(), type: z.enum(['running', 'savings', 'cash', 'wallet', 'credit', 'adjustment']).optional(), currency: currency.optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().min(0).max(10_000).optional() }).strict().refine(value => Object.keys(value).some(key => key !== 'accountId'), { message: 'At least one account change is required.' }), risk: 'write', confirmation: () => 'Update this account',
      async execute({ accountId, ...updates }, context) { const account = await requireAccount(context.householdId, accountId); await ledgerLib.updateAccount(context.householdId, accountId, { ...account, ...updates }, auditUser(context)); return { accountId }; },
    }),
    createCategory: defineAiTool({ description: 'Propose creating an income or expense category. Requires user confirmation.', inputSchema: z.object({ name, type: z.enum(['income', 'expense']), parentCategoryId: id.nullable().optional() }).strict(), risk: 'write', confirmation: input => `Create ${input.name} category`, execute: (input, context) => ledgerLib.createCategory(context.householdId, { ...input, isActive: true }, auditUser(context)) }),
    updateCategory: defineAiTool({ description: 'Propose renaming or activating/deactivating a category. Requires user confirmation.', inputSchema: z.object({ categoryId: id, name: name.optional(), isActive: z.boolean().optional() }).strict().refine(value => value.name !== undefined || value.isActive !== undefined, { message: 'At least one category change is required.' }), risk: 'write', confirmation: () => 'Update this category', async execute({ categoryId, ...updates }, context) { await requireCategory(context.householdId, categoryId); await ledgerLib.updateCategory(context.householdId, categoryId, updates, auditUser(context)); return { categoryId }; } }),
    createTransaction: defineAiTool({
      description: 'Propose logging an income, expense, transfer, or adjustment with balanced ledger lines. Requires user confirmation.',
      inputSchema: z.object({ type: z.enum(['income', 'expense', 'transfer', 'adjustment']), date: isoDate, description: z.string().trim().max(240).optional(), categoryId: id.nullable().optional(), budgetCycleId: id.nullable().optional(), lines: z.array(z.object({ accountId: id, signedAmount: signedMoney, currency }).strict()).min(1).max(2) }).strict().superRefine((value, ctx) => { const byCurrency = new Map<string, number>(); value.lines.forEach(line => byCurrency.set(line.currency, (byCurrency.get(line.currency) ?? 0) + line.signedAmount)); if (value.type === 'transfer') { if (value.lines.length !== 2) ctx.addIssue({ code: 'custom', message: 'Transfers require exactly two ledger lines.' }); if (new Set(value.lines.map(line => line.accountId)).size !== value.lines.length) ctx.addIssue({ code: 'custom', message: 'Transfer accounts must be different.' }); if (!value.lines.some(line => line.signedAmount < 0) || !value.lines.some(line => line.signedAmount > 0)) ctx.addIssue({ code: 'custom', message: 'Transfers require one outgoing and one incoming line.' }); if (byCurrency.size === 1 && [...byCurrency.values()].some(total => Math.abs(total) > 0.005)) ctx.addIssue({ code: 'custom', message: 'Same-currency transfer lines must balance to zero.' }); } }),
      risk: 'write', confirmation: input => `Log ${input.type}: ${input.description || input.date}`,
      async execute(input, context) { const accounts = await ledgerLib.getAccounts(context.householdId); for (const line of input.lines) { const account = accounts.find(item => item.id === line.accountId); if (!account) throw new Error('A selected account does not exist.'); if (account.currency !== line.currency) throw new Error('Ledger currency must match its account.'); } if (input.categoryId) await requireCategory(context.householdId, input.categoryId); const outgoing = input.lines.find(line => line.signedAmount < 0); const incoming = input.lines.find(line => line.signedAmount > 0); const conversionDetails = input.type === 'transfer' && outgoing && incoming && outgoing.currency !== incoming.currency ? { fromCurrency: outgoing.currency, toCurrency: incoming.currency, fromAmount: Math.abs(outgoing.signedAmount), toAmount: incoming.signedAmount, effectiveRate: incoming.signedAmount / Math.abs(outgoing.signedAmount), rateSource: 'manual' as const } : undefined; return transactionsLib.createTransaction(context.householdId, { type: input.type, date: input.date, description: input.description ?? null, categoryId: input.categoryId ?? null, budgetCycleId: input.budgetCycleId ?? null, createdBy: context.userId }, input.lines, conversionDetails, auditUser(context)); },
    }),
    voidTransaction: defineAiTool({ description: 'Propose voiding a transaction. Requires user confirmation.', inputSchema: z.object({ transactionId: id }).strict(), risk: 'write', confirmation: () => 'Void this transaction', async execute({ transactionId }, context) { await transactionsLib.voidTransaction(context.householdId, transactionId, auditUser(context)); return { transactionId }; } }),
    updateTransaction: defineAiTool({
      description: 'Propose editing an existing income or expense transaction. Requires user confirmation. Transfers and adjustments cannot be edited.',
      inputSchema: z.object({ transactionId: id, type: z.enum(['income', 'expense']), date: isoDate, description: z.string().trim().max(240).nullable().optional(), categoryId: id.nullable().optional(), budgetCycleId: id.nullable().optional(), accountId: id, amount: money, currency }).strict(), risk: 'write', confirmation: input => `Update transaction: ${input.description || input.date}`,
      async execute({ transactionId, accountId, amount, currency: currencyCode, ...updates }, context) {
        const [transactions, account] = await Promise.all([ledgerLib.getTransactions(context.householdId), requireAccount(context.householdId, accountId)]);
        const existing = transactions.find(item => item.id === transactionId);
        if (!existing || existing.status !== 'posted') throw new Error('Posted transaction not found.');
        if (existing.type === 'transfer' || existing.type === 'adjustment') throw new Error('Transfers and adjustments cannot be edited.');
        if (account.currency !== currencyCode) throw new Error('Transaction currency must match the account.');
        if (updates.categoryId) await requireCategory(context.householdId, updates.categoryId);
        await transactionsLib.updateTransaction(context.householdId, transactionId, updates, { accountId, signedAmount: updates.type === 'expense' ? -amount : amount, currency: currencyCode }, auditUser(context));
        return { transactionId };
      },
    }),
    createDebitCard: defineAiTool({ description: 'Propose creating a debit card linked to an existing running or savings account. Requires confirmation.', inputSchema: z.object({ ...cardDetails, parentAccountId: id }).strict(), risk: 'write', confirmation: input => `Create debit card ${input.name}`, async execute(input, context) { const accounts = await ledgerLib.getAccounts(context.householdId); return cardsLib.createDebitCard(context.householdId, { ...input, kind: 'debit', isActive: true }, accounts, auditUser(context)); } }),
    createCreditCard: defineAiTool({ description: 'Propose creating a credit card and its linked debt account. Requires confirmation.', inputSchema: z.object({ ...cardDetails, creditLimit: money, paymentAccountId: id }).strict(), risk: 'write', confirmation: input => `Create credit card ${input.name}`, async execute(input, context) { const accounts = await ledgerLib.getAccounts(context.householdId); const sortOrder = accounts.length ? Math.max(...accounts.map(account => account.sortOrder)) + 1 : 1; return cardsLib.createCreditCard(context.householdId, { ...input, kind: 'credit', parentAccountId: '', isActive: true }, accounts, sortOrder, auditUser(context)); } }),
    updateCard: defineAiTool({ description: 'Propose updating an existing debit or credit card. Requires confirmation.', inputSchema: z.object({ cardId: id, name: name.optional(), last4: z.string().trim().max(4).optional(), network: cardNetwork.optional(), bankId: z.string().trim().min(1).max(80).optional(), tierId: z.string().trim().max(80).optional(), expiryMonth: z.number().int().min(1).max(12).optional(), expiryYear: z.number().int().min(2020).max(2200).optional(), isActive: z.boolean().optional(), creditLimit: money.optional(), paymentAccountId: id.optional() }).strict().refine(value => Object.keys(value).some(key => key !== 'cardId'), { message: 'At least one card change is required.' }), risk: 'write', confirmation: () => 'Update this card', async execute({ cardId, ...updates }, context) { const accounts = await ledgerLib.getAccounts(context.householdId); await cardsLib.updateCard(context.householdId, cardId, updates, accounts, auditUser(context)); return { cardId }; } }),
    deleteCardStatement: defineAiTool({ description: 'Propose deleting an unpaid card statement. Statements linked to payments cannot be deleted. Requires confirmation.', inputSchema: z.object({ statementId: id }).strict(), risk: 'sensitive', confirmation: () => 'Delete this card statement', execute: ({ statementId }, context) => cardsLib.deleteStatement(context.householdId, statementId) }),
    createBudgetCycle: defineAiTool({ description: 'Propose creating a statement. Requires user confirmation.', inputSchema: z.object({ name, startDate: isoDate, endDate: isoDate.nullable().optional(), status: z.enum(['planned', 'open']).default('planned') }).strict().refine(value => !value.endDate || value.startDate <= value.endDate, { message: 'startDate must be on or before endDate' }), risk: 'write', confirmation: input => `Create statement ${input.name}`, execute: (input, context) => cyclesLib.createCycle(context.householdId, input, auditUser(context)) }),
    createLoan: defineAiTool({ description: 'Propose creating a validated fixed-payment loan connected to a paying account. Active loans are included directly in cycle commitments, outside categories. Requires confirmation.', inputSchema: loanInputSchema, risk: 'write', confirmation: input => `Add loan ${input.name} at ${input.installmentAmount} ${input.currency} per month`, execute: (input, context) => loansLib.createLoan(context.householdId, input, auditUser(context)) }),
    updateLoan: defineAiTool({ description: 'Propose replacing the validated terms or status of an existing loan. Requires confirmation.', inputSchema: z.object({ loanId: id, loan: loanInputSchema }).strict(), risk: 'write', confirmation: input => `Update loan ${input.loan.name}`, async execute({ loanId, loan }, context) { await loansLib.updateLoan(context.householdId, loanId, loan, auditUser(context)); return { loanId }; } }),
    recordLoanPayment: defineAiTool({ description: 'Propose recording the next loan installment. This atomically creates a direct loan expense and advances progress without using a category. Duplicate installment numbers are rejected. Requires confirmation.', inputSchema: z.object({ loanId: id, amount: money, date: isoDate, budgetCycleId: id.nullable().optional() }).strict(), risk: 'write', confirmation: input => `Record loan payment of ${input.amount}`, execute: ({ loanId, amount, date, budgetCycleId }, context) => loansLib.recordPayment(context.householdId, loanId, { amount, date, budgetCycleId }, context.userId, auditUser(context)) }),
    updateBudgetCycleStatus: defineAiTool({ description: 'Propose opening, planning, or closing a statement. Requires user confirmation.', inputSchema: z.object({ cycleId: id, status: z.enum(['planned', 'open', 'closed']), endDate: isoDate.optional() }).strict(), risk: 'write', confirmation: input => `${input.status === 'closed' ? 'Close' : 'Set'} this statement`, execute: ({ cycleId, status, endDate }, context) => cyclesLib.updateCycleStatus(context.householdId, cycleId, status, { ...(endDate ? { endDate } : {}), ...(status === 'closed' ? { closedAt: new Date().toISOString(), closedBy: context.userId } : {}) }, auditUser(context)) }),
    saveBudgetAllocation: defineAiTool({ description: 'Propose creating or replacing one category allocation for a cycle. Requires user confirmation.', inputSchema: allocationInput, risk: 'write', confirmation: input => `Allocate ${input.plannedAmount} ${input.currency}`, async execute(input, context) { await requireCategory(context.householdId, input.categoryId); return cyclesLib.saveBudgetAllocation(context.householdId, input, auditUser(context)); } }),
    saveBudgetAllocationsBatch: defineAiTool({ description: 'Propose replacing several category allocations for one cycle in a single operation. Requires confirmation.', inputSchema: z.object({ allocations: z.array(allocationInput).min(1).max(100) }).strict().refine(value => new Set(value.allocations.map(item => item.budgetCycleId)).size === 1, { message: 'All allocations must belong to the same cycle.' }).refine(value => new Set(value.allocations.map(item => item.categoryId)).size === value.allocations.length, { message: 'Each category may appear only once.' }), risk: 'write', confirmation: input => `Save ${input.allocations.length} budget allocations`, async execute({ allocations }, context) { const categories = await ledgerLib.getCategories(context.householdId); const validIds = new Set(categories.map(category => category.id)); if (allocations.some(allocation => !validIds.has(allocation.categoryId))) throw new Error('One or more categories do not exist.'); await cyclesLib.saveBudgetAllocationsBatch(context.householdId, allocations, auditUser(context)); return { count: allocations.length }; } }),
    saveExpectedIncome: defineAiTool({ description: 'Propose adding expected income to a cycle. Requires user confirmation.', inputSchema: z.object({ budgetCycleId: id, expectedDate: isoDate, amount: money, currency, expectedRateToBaseCurrency: z.number().positive().max(1_000_000), label: name, status: z.enum(['expected', 'received', 'cancelled']).default('expected'), receivedTransactionId: id.nullable().optional() }).strict(), risk: 'write', confirmation: input => `Add expected income: ${input.label}`, execute: (input, context) => cyclesLib.saveExpectedIncome(context.householdId, input, auditUser(context)) }),
    payCreditCard: defineAiTool({ description: 'Propose paying a credit card from its configured payment account. Requires user confirmation.', inputSchema: z.object({ cardId: id, amount: money, budgetCycleId: id.nullable().optional(), settlesChargeIds: z.array(id).max(100).optional() }).strict(), risk: 'write', confirmation: input => `Pay ${input.amount} toward this card`, async execute({ cardId, amount, budgetCycleId, settlesChargeIds }, context) { const card = (await cardsLib.getCards(context.householdId)).find(item => item.id === cardId); if (!card || card.kind !== 'credit') throw new Error('Credit card not found.'); return cardsLib.payCard(context.householdId, card, amount, auditUser(context), settlesChargeIds, budgetCycleId); } }),
    updateNotificationSettings: defineAiTool({ description: 'Propose updating the current user notification preferences. Requires user confirmation.', inputSchema: z.object({ dailyReminderEnabled: z.boolean(), categoryWarningEnabled: z.boolean(), cardExpiryWarningEnabled: z.boolean(), joinRequestEnabled: z.boolean() }).strict(), risk: 'write', confirmation: () => 'Update notification preferences', async execute(input, context) { const settings: NotificationSettings = { ...input, householdId: context.householdId, userId: context.userId }; await ledgerLib.updateNotificationSettings(context.householdId, context.userId, settings, auditUser(context)); return settings; } }),
    approvePendingTransaction: defineAiTool({ description: 'Propose approving an imported pending financial message as a transaction. Requires user confirmation.', inputSchema: z.object({ pendingId: id, categoryId: id, accountId: id, destinationAccountId: id.optional() }).strict(), risk: 'write', confirmation: () => 'Approve this pending transaction', async execute(input, context) { await requireCategory(context.householdId, input.categoryId); await requireAccount(context.householdId, input.accountId); if (input.destinationAccountId) await requireAccount(context.householdId, input.destinationAccountId); return messageIngestionLib.approve({ householdId: context.householdId, ...input }); } }),
    discardPendingTransaction: defineAiTool({ description: 'Propose discarding an imported pending financial message. Requires user confirmation.', inputSchema: z.object({ pendingId: id }).strict(), risk: 'write', confirmation: () => 'Discard this pending transaction', execute: ({ pendingId }, context) => messageIngestionLib.discard(context.householdId, pendingId) }),
    listResolvedPendingTransactions: defineAiTool({ description: 'List previously approved or discarded imported financial messages.', inputSchema: emptyInput, risk: 'read', execute: (_, context) => messageIngestionLib.getResolved(context.householdId) }),
    restoreDiscardedPendingTransaction: defineAiTool({ description: 'Propose restoring a discarded imported financial message to approvals. Requires confirmation.', inputSchema: z.object({ pendingId: id }).strict(), risk: 'write', confirmation: () => 'Restore this pending transaction', execute: ({ pendingId }, context) => messageIngestionLib.restoreDiscarded(context.householdId, pendingId) }),
    reconcileAccount: defineAiTool({
      description: 'Propose reconciling an account to an actual balance. Creates an adjustment transaction when needed and records the reconciliation. Requires confirmation.', inputSchema: z.object({ accountId: id, actualBalance: z.number().min(-1_000_000_000).max(1_000_000_000), date: isoDate, note: z.string().trim().max(240).nullable().optional(), budgetCycleId: id.nullable().optional() }).strict(), risk: 'write', confirmation: input => `Reconcile account to ${input.actualBalance}`,
      async execute({ accountId, actualBalance, date, note, budgetCycleId }, context) {
        const [account, transactions, ledgerLines] = await Promise.all([requireAccount(context.householdId, accountId), ledgerLib.getTransactions(context.householdId), ledgerLib.getLedgerLines(context.householdId) as Promise<LedgerLine[]>]);
        const calculatedBalance = calculateAccountBalances([account], transactions, ledgerLines)[accountId] ?? 0;
        const difference = Number((actualBalance - calculatedBalance).toFixed(2));
        let adjustmentTransactionId: string | null = null;
        if (Math.abs(difference) > 0.001) adjustmentTransactionId = await transactionsLib.createTransaction(context.householdId, { type: 'adjustment', date, description: `Balance correction: ${note || 'Reconciliation adjustment'}`, createdBy: context.userId, budgetCycleId: budgetCycleId ?? null }, [{ accountId, signedAmount: difference, currency: account.currency }], undefined, auditUser(context));
        const reconId = crypto.randomUUID();
        await ledgerLib.createReconciliation(context.householdId, reconId, { id: reconId, householdId: context.householdId, accountId, date, calculatedBalance, actualBalance, difference, currency: account.currency, createdBy: context.userId, createdAt: new Date().toISOString(), adjustmentTransactionId, note: note ?? null }, auditUser(context));
        return { reconciliationId: reconId, calculatedBalance, actualBalance, difference, adjustmentTransactionId };
      },
    }),
    updateHouseholdBaseCurrency: defineAiTool({ description: 'Propose changing the shared account base currency. This affects app-wide display and requires confirmation.', inputSchema: z.object({ baseCurrency: currency }).strict(), risk: 'sensitive', confirmation: input => `Change household base currency to ${input.baseCurrency}`, execute: ({ baseCurrency }, context) => ledgerLib.updateHouseholdBaseCurrency(context.householdId, baseCurrency) }),
    createHousehold: defineAiTool({ description: 'Propose creating a new shared account. Requires confirmation.', inputSchema: z.object({ name }).strict(), risk: 'sensitive', confirmation: input => `Create household ${input.name}`, execute: ({ name: householdName }, context) => { if (!context.appActions) throw new Error('Household actions are unavailable.'); return context.appActions.createHousehold(householdName); } }),
    switchHousehold: defineAiTool({ description: 'Propose switching the app to another household the user already belongs to. Requires confirmation.', inputSchema: z.object({ householdId: id }).strict(), risk: 'sensitive', confirmation: () => 'Switch the active household', execute: ({ householdId }, context) => { if (!context.appActions) throw new Error('Household actions are unavailable.'); return context.appActions.switchHousehold(householdId); } }),
    requestHouseholdJoin: defineAiTool({ description: 'Propose requesting access to another household by ID. Requires confirmation.', inputSchema: z.object({ householdId: id }).strict(), risk: 'sensitive', confirmation: () => 'Request access to this shared account', execute: ({ householdId }, context) => { if (!context.appActions) throw new Error('Household actions are unavailable.'); return context.appActions.requestToJoinHousehold(householdId); } }),
    decideHouseholdJoinRequest: defineAiTool({ description: 'Propose approving or rejecting a shared account join request. Owner authorization is enforced by the application service. Requires confirmation.', inputSchema: z.object({ requesterUid: id, decision: z.enum(['approve', 'reject']) }).strict(), risk: 'sensitive', confirmation: input => `${input.decision === 'approve' ? 'Approve' : 'Reject'} this join request`, execute: ({ requesterUid, decision }, context) => { if (!context.appActions) throw new Error('Household actions are unavailable.'); return context.appActions.decideJoinRequest(context.householdId, requesterUid, decision); } }),
    leaveHousehold: defineAiTool({ description: 'Propose leaving the active household. This may remove access and requires confirmation.', inputSchema: emptyInput, risk: 'sensitive', confirmation: () => 'Leave the active household', execute: (_, context) => { if (!context.appActions) throw new Error('Household actions are unavailable.'); return context.appActions.leaveHousehold(context.householdId); } }),
    createMessageConnection: defineAiTool({ description: 'Propose creating a private iPhone Shortcut message-ingestion connection. The one-time token is shown only after confirmation and is not saved in chat history.', inputSchema: emptyInput, risk: 'sensitive', confirmation: () => 'Create a secure message connection', execute: (_, context) => messageIngestionLib.createCredential(context.householdId) }),
    revokeMessageConnection: defineAiTool({ description: 'Propose permanently revoking a message-ingestion connection. Requires confirmation.', inputSchema: z.object({ credentialId: id }).strict(), risk: 'sensitive', confirmation: () => 'Revoke this message connection', execute: ({ credentialId }) => messageIngestionLib.revokeCredential(credentialId) }),
    enablePushNotifications: defineAiTool({ description: 'Propose enabling push notifications on this device. The browser may show a permission prompt. Requires confirmation.', inputSchema: emptyInput, risk: 'sensitive', confirmation: () => 'Enable notifications on this device', execute: (_, context) => { if (!context.appActions) throw new Error('Device notification actions are unavailable.'); return context.appActions.enableNotifications(); } }),
    disablePushNotifications: defineAiTool({ description: 'Propose unregistering push notifications on this device. Requires confirmation.', inputSchema: emptyInput, risk: 'sensitive', confirmation: () => 'Disable notifications on this device', execute: (_, context) => { if (!context.appActions) throw new Error('Device notification actions are unavailable.'); return context.appActions.disableNotifications(); } }),
  };
}

export function toAiSdkTools(registry: AiToolRegistry, context: AiToolContext, onActionProposed?: (action: PendingAiAction) => void, onChart?: (chart: AiChartSpec) => void) {
  return Object.fromEntries(Object.entries(registry).map(([toolName, definition]) => [toolName, tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: async input => {
      if (definition.risk === 'read' || definition.risk === 'memory') {
        const result = await executeValidatedTool(definition, input, context);
        if (toolName === 'renderChart') onChart?.(result as AiChartSpec);
        return result;
      }
      const parsed = await parseToolInput(definition, input);
      const action: PendingAiAction = { id: crypto.randomUUID(), toolName, input: parsed, summary: definition.confirmation?.(parsed) ?? 'Confirm this change', risk: definition.risk };
      onActionProposed?.(action);
      return { status: 'confirmation_required', actionId: action.id, message: 'The user must confirm this action using the confirmation control. Do not claim it was completed.' };
    },
  })]));
}

export async function executePendingAiAction(action: PendingAiAction, context: AiToolContext): Promise<unknown> {
  const definition = createAiToolRegistry()[action.toolName];
  if (!definition || definition.risk === 'read') throw new Error('This action is no longer available.');
  return executeConfirmedTool(definition, action.input, context);
}
