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

/**
 * What a member may see inside a shared account. `full` is today's behavior
 * (everything); `sharedBalanceOnly` limits a member to shared-balance entries
 * and the member list. Enforced in firestore.rules, never just in the UI.
 */
export type AccessLevel = 'full' | 'sharedBalanceOnly';

/** Per-shared-account membership details stored on the user doc. */
export type Membership = {
  accessLevel: AccessLevel;
};

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  householdId: string | null;
  householdIds?: string[];
  role: UserRole;
  /** Access level per household id. A missing entry means 'full' (legacy members). */
  memberships?: Record<string, Membership>;
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
  /** Access level the joiner suggests (invite link may carry it); the owner decides at approval. */
  requestedLevel?: AccessLevel | null;
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
  accessLevel: AccessLevel;
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
  /** Marks the virtual shared-balance account that receives mirror entries. */
  isSharedBalance?: boolean;
  /**
   * Member who owns this account within the space. Null/unset = unowned
   * (behaves as today). Transfers into or out of an owned account need the
   * owner's approval when someone else initiates them.
   */
  ownerUid?: string | null;
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
  /** Present when an imported card charge settled in the account currency after conversion from its original currency. */
  originalCharge?: { currency: CurrencyCode; amount: number; rate: number } | null;
  /** Set when this transaction is the ledger mirror of an approved shared-balance entry. */
  sharedBalanceEntryId?: string | null;
  /**
   * Present while a transfer awaits owner approvals (status 'draft'). The
   * ledger lines are written only when every required owner has approved.
   */
  transferDraft?: {
    sourceAccountId: string;
    destinationAccountId: string;
    amount: number;
    currency: CurrencyCode;
    destinationAmount: number;
    destinationCurrency: CurrencyCode;
    /** One entry per owner whose approval is required. */
    requiredApprovals: string[];
    /** Owners who already approved. */
    approvals: { uid: string; decidedAt: string }[];
  } | null;
  /** Set when this draft transaction was materialized from a recurring rule. */
  recurringRuleId?: string | null;
};

export type SharedBalanceEntryKind = 'iou' | 'split' | 'repayment';

export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

/**
 * A repeating shared-balance entry rule. Each due occurrence is materialized
 * by the daily cron as a PENDING SharedBalanceEntry (author = rule creator);
 * the counterparty confirms it via the normal approval flow.
 */
export type RecurringSharedEntryRule = {
  id: string;
  householdId: string;
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: CurrencyCode;
  typeLabel: string;
  note?: string | null;
  frequency: RecurringFrequency;
  anchorDate: string;            // YYYY-MM-DD, first occurrence date
  endDate?: string | null;       // inclusive; null = never
  maxOccurrences?: number | null;
  status: 'active' | 'paused' | 'cancelled';
  createdBy: string;
  occurrencesCreated: number;
  lastOccurrenceDate?: string | null;
  /** Set on resume; occurrences before it are never backfilled. */
  resumedDate?: string | null;
  createdAt: number;
  updatedAt: number;
};

/**
 * A between-two-members entry on the shared balance. `fromUid` provided the
 * money/value; `toUid` owes `fromUid` `amount`. A repayment flows the other
 * way (debtor → creditor), reducing the debt. Entries count toward the
 * balance only once `status` is 'approved' — approval is always granted by
 * the counterparty (the non-author), never the author.
 */
export type SharedBalanceEntry = {
  id: string;
  householdId: string;
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: CurrencyCode;
  /** Banking-style label chosen by the author: Cash, InstaPay, bank transfer, loan, shared bill… */
  typeLabel: string;
  note?: string | null;
  date: string; // YYYY-MM-DD
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdBy: string;
  /** Bumped on every edit; edits reset an approved entry to pending. */
  revision: number;
  /** Posted adjustment transaction created at approval (the ledger mirror). */
  mirrorTransactionId?: string | null;
  /** Set when the entry was created from a bank-message approval tag. */
  sourceTransactionId?: string | null;
  sourcePendingId?: string | null;
  /** Set when the entry was materialized from a recurring rule. */
  recurringRuleId?: string | null;
  /** Snapshot display names so shared-balance-only members need no users/ reads. */
  fromDisplayName: string;
  toDisplayName: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
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

/**
 * Merchant-pattern rule that auto-assigns a category to ingested bank
 * messages: when `pattern` (case-insensitive substring) matches the message
 * description or counterparty, `categoryId` is suggested at approval.
 */
export type CategoryRule = {
  id: string;
  householdId: string;
  pattern: string;
  categoryId: string;
  createdBy: string;
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
  /** Confirmations for recurring shared-balance occurrences. Absent = enabled. */
  recurringEntriesEnabled: boolean;
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
  | 'pending_message_restored'
  | 'shared_balance_proposed'
  | 'shared_balance_approved'
  | 'shared_balance_rejected'
  | 'shared_balance_cancelled'
  | 'shared_balance_edited'
  | 'member_access_updated';

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
  /** Category suggested by a merchant-pattern rule match (overridable at approval). */
  suggestedCategoryId?: string | null;
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
  /** True when a credit-card charge arrived in a currency different from the card's parent account; approval must supply the converted amount. */
  conversionRequired?: boolean | null;
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
