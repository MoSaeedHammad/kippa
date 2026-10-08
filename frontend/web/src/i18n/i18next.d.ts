import 'i18next';
import type common from './locales/en/common.json';
import type appShell from './locales/en/appShell.json';
import type auth from './locales/en/auth.json';
import type dashboard from './locales/en/dashboard.json';
import type transactions from './locales/en/transactions.json';
import type shared from './locales/en/shared.json';
import type sharedBalance from './locales/en/sharedBalance.json';
import type sharedAccounts from './locales/en/sharedAccounts.json';
import type household from './locales/en/household.json';
import type activity from './locales/en/activity.json';
import type notifications from './locales/en/notifications.json';
import type accounts from './locales/en/accounts.json';
import type categories from './locales/en/categories.json';
import type cards from './locales/en/cards.json';
import type budgetCycles from './locales/en/budgetCycles.json';
import type fastEntry from './locales/en/fastEntry.json';
import type pendingTransactions from './locales/en/pendingTransactions.json';
import type reconciliation from './locales/en/reconciliation.json';
import type loans from './locales/en/loans.json';
import type ai from './locales/en/ai.json';
import type messageImport from './locales/en/messageImport.json';
import type recurring from './locales/en/recurring.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      appShell: typeof appShell;
      auth: typeof auth;
      dashboard: typeof dashboard;
      transactions: typeof transactions;
      shared: typeof shared;
      sharedBalance: typeof sharedBalance;
      sharedAccounts: typeof sharedAccounts;
      household: typeof household;
      activity: typeof activity;
      notifications: typeof notifications;
      accounts: typeof accounts;
      categories: typeof categories;
      cards: typeof cards;
      budgetCycles: typeof budgetCycles;
      fastEntry: typeof fastEntry;
      pendingTransactions: typeof pendingTransactions;
      reconciliation: typeof reconciliation;
      loans: typeof loans;
      ai: typeof ai;
      messageImport: typeof messageImport;
      recurring: typeof recurring;
    };
  }
}
