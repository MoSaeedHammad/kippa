/**
 * ISO 4217 currency code as a plain string (e.g. 'EGP', 'USD', 'SAR', 'AED', 'EUR').
 * Kept as a string alias rather than a fixed union so the app supports any
 * currency without code changes. The curated list users pick from lives in
 * `frontend/web/src/libs/currencyMeta.ts`.
 */
export type CurrencyCode = string;

export type AccountType = 'running' | 'savings' | 'cash' | 'wallet' | 'credit' | 'adjustment';

export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';

export type BudgetCycleStatus = 'planned' | 'open' | 'closed';
export type LoanStatus = 'active' | 'paid' | 'paused';

export type UserRole = 'owner' | 'member';

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  householdId: string | null;
  householdIds?: string[];
  role: UserRole;
  createdAt: string;
  photoURL?: string;
  lastSeenActivities?: Record<string, string>;
};

export type Household = {
  id: string;
  name: string;
  baseCurrency: CurrencyCode;
  createdAt: string;
  createdBy: string;
};

export type JoinStatus = 'pending' | 'approved' | 'rejected';

export type JoinRequest = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  status: JoinStatus;
  requestedAt: number;
  decidedAt?: number;
  decidedBy?: string;
};

/**
 * Slim member shape returned by the listHouseholdMembers Callable.
 * Server returns only what the UI needs (no secrets).
 */
export type HouseholdMember = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  isOwner: boolean;
};

export type Account = {
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
};

export type CardKind = 'debit' | 'credit';
export type CardNetwork = 'visa' | 'mastercard' | 'meeza' | 'other';
export type CardStatementStatus = 'pending' | 'partial' | 'paid';

export type Card = {
  id: string;
  householdId: string;
  kind: CardKind;
  parentAccountId: string;          // REQUIRED. debit → running/savings account; credit → credit account.
  name: string;
  last4?: string;
  network?: CardNetwork;
  bankId: string;                    // e.g. 'hsbc' | 'cib' | 'nbe' | 'other'
  tierId?: string;                   // e.g. 'premier' | 'platinum' | 'classic'
  expiryMonth?: number;             // 1–12
  expiryYear?: number;              // e.g. 2027
  isActive: boolean;
  createdAt: string;
  // Credit only:
  creditLimit?: number;
  paymentAccountId?: string;        // default source account for "Mark as paid"
  currency: CurrencyCode;           // must equal paymentAccountId's currency
  notifiedCardExpiryAt?: string;    // YYYY-MM-DD sentinel used by notification functions
};

export type CardStatement = {
  id: string;
  householdId: string;
  cardId: string;
  creditAccountId: string;          // denormalized for query
  statementDate: string;            // ISO date user entered (cycle close)
  statementBalance: number;         // user-entered bill amount
  minPayment?: number;
  dueDate: string;                  // ISO date user entered
  status: CardStatementStatus;
  paymentTransactionId?: string;    // linked transfer(s) — see markAsPaid
  notifiedCardExpiryAt?: string;    // sentinel so expiry push fires once
  createdAt: string;
};

export type FinanceTransaction = {
  id: string;
  householdId: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  description?: string | null;
  categoryId?: string | null;
  budgetCycleId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'posted' | 'voided';
  revisionOf?: string | null;
  // For card-payment transfers only: the expense transaction id(s) this payment
  // settles on the credit account. Lets the UI show a charge as "paid" as a
  // recorded fact instead of guessing via FIFO amount allocation.
  settlesChargeIds?: string[] | null;
  /** Present when this expense is a scheduled loan repayment. */
  loanId?: string | null;
  loanInstallmentNumber?: number | null;
};

export type Loan = {
  id: string;
  householdId: string;
  name: string;
  currency: CurrencyCode;
  /** Total of all fixed installments. This is the contract cash commitment. */
  originalTotal: number;
  installmentAmount: number;
  totalInstallments: number;
  /** Historical installments represented as an opening balance, before linked app transactions. */
  openingPaidInstallments?: number;
  openingPaidAmount?: number;
  firstPaymentDate: string;
  dueDay: number;
  graceDay?: number | null;
  paymentAccountId: string;
  /** Legacy migration link only. New loans are not categories. */
  categoryId?: string | null;
  status: LoanStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LedgerLine = {
  id: string;
  householdId: string;
  transactionId: string;
  accountId: string;
  /** For credit purchases, signedAmount includes the fee; baseAmount is the message amount. */
  cardFee?: { baseAmount: number; rate: number };
  signedAmount: number; // Positive is in, negative is out
  currency: CurrencyCode;
  createdAt: string;
};

export type ConversionDetails = {
  transactionId: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  fromAmount: number;
  toAmount: number;
  effectiveRate: number;
  rateSource: 'manual' | 'bank' | 'expected' | 'api';
};

export type BudgetCycle = {
  id: string;
  householdId: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;  // YYYY-MM-DD
  status: BudgetCycleStatus;
  salaryTransactionId?: string | null;
  closedAt?: string | null;
  closedBy?: string | null;
  revisedAt?: string | null;
};

export type Category = {
  id: string;
  householdId: string;
  name: string;
  type: 'income' | 'expense';
  isActive: boolean;
  parentCategoryId?: string | null;
  createdAt: string;
};

export type BudgetAllocation = {
  id: string;
  householdId: string;
  budgetCycleId: string;
  categoryId: string;
  plannedAmount: number;
  currency: CurrencyCode;
  carryLeftover: boolean;
  notes?: string | null;
};

export type ExpectedIncome = {
  id: string;
  householdId: string;
  budgetCycleId: string;
  expectedDate: string;
  amount: number;
  currency: CurrencyCode;
  expectedRateToBaseCurrency: number;
  label: string;
  status: 'expected' | 'received' | 'cancelled';
  receivedTransactionId?: string | null;
};

export type ExchangeRate = {
  id: string;
  householdId: string;
  date: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  rate: number;
  source: 'manual' | 'bank' | 'api' | 'expected';
  createdAt: string;
};

export type Reconciliation = {
  id: string;
  householdId: string;
  accountId: string;
  date: string;
  calculatedBalance: number;
  actualBalance: number;
  difference: number;
  currency: CurrencyCode;
  createdBy: string;
  createdAt: string;
  adjustmentTransactionId?: string | null;
  note?: string | null;
};

export type NotificationSettings = {
  userId: string;
  householdId: string;
  dailyReminderEnabled: boolean;
  categoryWarningEnabled: boolean;
  cardExpiryWarningEnabled: boolean;
  joinRequestEnabled: boolean;
};

export type AuditAction =
  | 'transaction_created'
  | 'transaction_voided'
  | 'transaction_updated'
  | 'account_created'
  | 'account_updated'
  | 'category_created'
  | 'category_updated'
  | 'cycle_created'
  | 'cycle_status_changed'
  | 'allocation_saved'
  | 'allocations_batch_saved'
  | 'expected_income_saved'
  | 'reconciliation_created'
  | 'notification_settings_updated'
  | 'loan_created'
  | 'loan_updated'
  | 'loan_payment_recorded'
  | 'household_joined'
  | 'household_left'
  | 'pending_message_discarded'
  | 'pending_message_restored';

export type AuditLogEntry = {
  id: string;
  householdId: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL?: string;
  action: AuditAction;
  summary: string;
  details?: Record<string, any>;
  createdAt: string;
};

export type PendingFinancialMessage = {
  id: string;
  householdId: string;
  receivedBy: string;
  kind: 'expense' | 'income' | 'transfer';
  source: string;
  provider: string;
  amount: number;
  currency: CurrencyCode;
  date: string;
  description: string;
  counterparty?: string | null;
  messagePreview: string;
  accountHintLast4?: string | null;
  destinationHintLast4?: string | null;
  suggestedAccountId?: string | null;
  suggestedDestinationAccountId?: string | null;
  /** Strictly matched active loan; approval records the next installment without a category. */
  suggestedLoanId?: string | null;
  suggestedLoanName?: string | null;
  suggestedLoanInstallmentNumber?: number | null;
  /** Amount on the destination leg of a cross-currency transfer (from the credit SMS). */
  destinationAmount?: number | null;
  /** Currency of the destination leg when it differs from `currency`. */
  destinationCurrency?: CurrencyCode | null;
  /** Marks one leg of a multi-message transfer before the pair is merged. */
  transferLeg?: 'debit' | 'credit' | null;
  /** Shared key used to correlate matching transfer legs. */
  mergeKey?: string | null;
  createdAt: string;
  status: 'pending';
};

export type ResolvedPendingFinancialMessage = {
  id: string;
  state: 'approved' | 'discarded';
  snapshot: PendingFinancialMessage;
  transactionId?: string | null;
  resolvedAt: string;
  resolvedBy: string;
  resolvedByDisplayName: string;
};

export type MessageIngestionCredential = {
  id: string;
  label: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
};

export type FcmToken = {
  token: string;
  uid: string;
  deviceType: 'ios' | 'android' | 'web';
  createdAt: string;
  lastSeenAt: string;
};

export type NotificationState = {
  lastReminderSentDate?: string;
  lastWarningFor?: Record<string, string>;
};
