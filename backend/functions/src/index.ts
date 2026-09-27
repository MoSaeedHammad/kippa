import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onTransactionCreated } from './features/transactions/onTransactionCreated.js';
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
export {
  proposeSharedBalanceEntry,
  decideSharedBalanceEntry,
  updateMemberAccessLevel,
} from './features/shared-balance/sharedBalance.js';
