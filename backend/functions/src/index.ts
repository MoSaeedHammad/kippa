import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onTransactionCreated } from './features/transactions/onTransactionCreated.js';
export { proposeTransfer, decideDraftTransfer } from './features/transactions/transferApprovals.js';
export { upsertRecurringTransactionRule, confirmRecurringTransaction } from './features/transactions/recurringTransactions.js';
export { recurringTransactionsCron } from './features/transactions/recurringTransactionsCron.js';
export { dailyReminderCron } from './features/notifications/dailyReminderCron.js';
export {
  createHousehold,
  requestToJoinHousehold,
  decideJoinRequest,
  leaveHousehold,
  listHouseholdMembers,
} from './features/households/householdMemberships.js';
export {
  approvePendingFinancialMessage,
  createMessageIngestionCredential,
  discardPendingFinancialMessage,
  ingestFinancialMessage,
  listMessageIngestionCredentials,
  listResolvedPendingFinancialMessages,
  revokeMessageIngestionCredential,
  restoreDiscardedPendingFinancialMessage,
} from './features/message-ingestion/messageIngestion.js';
export { importMessageHistory, decideImportBatch } from './features/message-ingestion/messageHistoryImport.js';
export { importRecordHistory } from './features/message-ingestion/recordHistoryImport.js';
export { glmProxy } from './features/ai/glmProxy.js';
export { upsertCategoryRule } from './features/categories/categoryRules.js';
export {
  proposeSharedBalanceEntry,
  decideSharedBalanceEntry,
  updateMemberAccessLevel,
  upsertRecurringSharedEntryRule,
} from './features/shared-balance/sharedBalance.js';
export { recurringSharedEntriesCron } from './features/shared-balance/recurringSharedEntriesCron.js';
