import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import type {
  FinanceTransaction,
  LedgerLine,
  BudgetCycle,
  BudgetAllocation,
  NotificationSettings,
  NotificationState,
  UserProfile,
} from '@kippa/domain';
import {
  checkPercentageThresholds,
  checkVelocitySpike,
  isVelocityKeyExpired,
  buildCategoryWarningNotification,
  sumAmounts,
  countUniqueDays,
  type SpendingEntry,
  type VelocityContext,
} from '../../domain/notifications/warnings.js';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';
import { accessLevelOf, listFullMemberUids } from '../../libs/householdAccess.js';
import { todayInTz } from '../../domain/timezone.js';
import {
  formatTransactionNotificationBody,
  getAmountString,
} from '../../domain/transactions/notificationFormatting.js';

/**
 * Firestore trigger: fires whenever a new transaction is created.
 * - Pushes a notification to all other household members.
 * - If the transaction is an expense, checks whether the category crossed
 *   80% of its allocation and pushes a warning (once per category per day).
 */
export const onTransactionCreated = onDocumentCreated(
  'households/{householdId}/transactions/{transactionId}',
  async (event) => {
    const householdId = event.params.householdId;
    const txn = event.data?.data() as FinanceTransaction | undefined;
    if (!txn || txn.status === 'voided' || txn.status === 'draft') return;
    // Mirror transactions of approved shared-balance entries already pushed
    // their own notification at proposal time; never double-notify.
    if (txn.sharedBalanceEntryId) return;

    const db = getFirestore();

    // --- 1. Fetch all household members ---
    const membersSnap = await db
      .collection('users')
      .where('householdId', '==', householdId)
      .get();
    const members = membersSnap.docs.map((d) => ({
      uid: d.id,
      ...(d.data() as Omit<UserProfile, 'uid'>),
    }));

    // Spending activity is private to full members — shared-balance-only
    // members must not learn about transactions they cannot see.
    const fullMembers = members.filter(
      (m) => accessLevelOf(m, householdId) === 'full',
    );

    // --- 2. Transaction push to full members except the author ---
    const recipientUids = fullMembers.filter((m) => m.uid !== txn.createdBy).map((m) => m.uid);

    if (recipientUids.length > 0) {
      const author = members.find((m) => m.uid === txn.createdBy);
      const authorName = author?.displayName ?? 'Someone';

      // Fetch amount/currency from ledger lines
      let amountStr = '';
      try {
        const linesSnap = await db
          .collection(`households/${householdId}/ledgerLines`)
          .where('transactionId', '==', event.params.transactionId)
          .get();
        const lines = linesSnap.docs.map((d) => d.data() as LedgerLine);
        amountStr = getAmountString(txn.type, lines);
      } catch (err) {
        console.error('Error fetching ledger lines for notification:', err);
      }

      // Fetch category name if categoryId exists
      let categoryName = '';
      if (txn.categoryId) {
        try {
          const categorySnap = await db
            .doc(`households/${householdId}/categories/${txn.categoryId}`)
            .get();
          if (categorySnap.exists) {
            categoryName = categorySnap.data()?.name ?? '';
          }
        } catch (err) {
          console.error('Error fetching category for notification:', err);
        }
      }

      const body = formatTransactionNotificationBody(authorName, txn, amountStr, categoryName);

      const tokens = await getTokensForUsers(householdId, recipientUids);
      if (tokens.length > 0) {
        await sendToMany(
          householdId,
          tokens,
          buildMessagePayload({
            type: 'transaction',
            title: 'New transaction',
            body,
            householdId,
            deepLink: '/',
          }),
        );
      }
    }

    // --- 3. Category warning (expenses only) ---
    if (txn.type === 'expense' && txn.categoryId) {
      await checkCategoryWarning(db, householdId, txn);
    }
  },
);

async function checkCategoryWarning(
  db: FirebaseFirestore.Firestore,
  householdId: string,
  txn: FinanceTransaction,
): Promise<void> {
  const categoryId = txn.categoryId!;

  // Find the open budget cycle
  const cycleSnap = await db
    .collection(`households/${householdId}/budgetCycles`)
    .where('status', '==', 'open')
    .limit(1)
    .get();
  if (cycleSnap.empty) return;
  const cycle = cycleSnap.docs[0].data() as BudgetCycle;
  const cycleId = cycleSnap.docs[0].id;

  // Find the allocation for this category
  const allocSnap = await db
    .collection(`households/${householdId}/budgetAllocations`)
    .where('budgetCycleId', '==', cycleId)
    .where('categoryId', '==', categoryId)
    .limit(1)
    .get();
  if (allocSnap.empty) return;
  const allocation = allocSnap.docs[0].data() as BudgetAllocation;
  if (allocation.plannedAmount <= 0) return;

  // Fetch all posted expense transactions for this category in this cycle
  const txnsSnap = await db
    .collection(`households/${householdId}/transactions`)
    .where('categoryId', '==', categoryId)
    .where('status', '==', 'posted')
    .get();
  const postedTxns = txnsSnap.docs
    .filter((d) => {
      const data = d.data() as FinanceTransaction;
      return data.budgetCycleId === cycleId;
    })
    .map((d) => d.data() as FinanceTransaction);
  if (postedTxns.length === 0) return;

  // Fetch ledger lines and sum spent
  const postedTxnIds = new Set(postedTxns.map((t) => t.id));
  const linesSnap = await db.collection(`households/${householdId}/ledgerLines`).get();
  let spent = 0;
  for (const lineDoc of linesSnap.docs) {
    const line = lineDoc.data() as LedgerLine;
    if (postedTxnIds.has(line.transactionId) && line.signedAmount < 0) {
      spent += Math.abs(line.signedAmount);
    }
  }

  // Check percentage thresholds
  const threshold = checkPercentageThresholds(spent, allocation.plannedAmount);

  // Check velocity spike — split transactions into earlier/recent periods
  const today = new Date();
  const cycleStart = new Date(cycle.startDate + 'T00:00:00Z');
  const msPerDay = 1000 * 60 * 60 * 24;
  const cutoffDate = new Date(today.getTime() - 7 * msPerDay);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  const earlierEntries: SpendingEntry[] = [];
  const recentEntries: SpendingEntry[] = [];
  for (const t of postedTxns) {
    const entry: SpendingEntry = { amount: 0, date: t.date };
    for (const lineDoc of linesSnap.docs) {
      const line = lineDoc.data() as LedgerLine;
      if (line.transactionId === t.id && line.signedAmount < 0) {
        entry.amount += Math.abs(line.signedAmount);
      }
    }
    if (t.date < cutoffStr) {
      earlierEntries.push(entry);
    } else {
      recentEntries.push(entry);
    }
  }

  let velocityContext: VelocityContext | null = null;
  if (checkVelocitySpike(earlierEntries, recentEntries, allocation.plannedAmount)) {
    const earlierDays = countUniqueDays(earlierEntries);
    const recentDays = countUniqueDays(recentEntries);
    const earlierTotal = sumAmounts(earlierEntries);
    const recentTotal = sumAmounts(recentEntries);
    velocityContext = {
      earlierAvg: Math.round(earlierTotal / earlierDays),
      recentAvg: Math.round(recentTotal / recentDays),
    };
  }

  if (!threshold && !velocityContext) return;

  // Dedup check
  const householdStateRef = db.doc(
    `households/${householdId}/notificationState/_household`,
  );
  const stateSnap = await householdStateRef.get();
  const state = (stateSnap.data() as NotificationState) ?? {};

  const keysToFire: string[] = [];

  if (threshold) {
    const key = `${categoryId}_${cycleId}_${threshold}`;
    if (!state.lastWarningFor?.[key]) {
      keysToFire.push(key);
    }
  }

  if (velocityContext) {
    const velKey = `${categoryId}_${cycleId}_vel`;
    const lastDate = state.lastWarningFor?.[velKey];
    if (isVelocityKeyExpired(lastDate)) {
      keysToFire.push(velKey);
    } else {
      velocityContext = null; // deduped — don't include in message
    }
  }

  if (keysToFire.length === 0) return;

  // Fetch category name
  let categoryName = '';
  try {
    const categorySnap = await db
      .doc(`households/${householdId}/categories/${categoryId}`)
      .get();
    if (categorySnap.exists) {
      categoryName = categorySnap.data()?.name ?? '';
    }
  } catch {
    // non-critical
  }

  const notification = buildCategoryWarningNotification({
    categoryName,
    spent,
    planned: allocation.plannedAmount,
    currency: allocation.currency,
    threshold,
    velocityContext,
  });
  if (!notification) return;

  // Find members with categoryWarningEnabled — full members only, since the
  // warning reveals spending amounts.
  const settingsSnap = await db
    .collection(`households/${householdId}/notificationSettings`)
    .where('categoryWarningEnabled', '==', true)
    .get();
  const fullMemberUids = new Set(
    (await listFullMemberUids(householdId)),
  );
  const settingsUids = settingsSnap.docs.map(
    (d) => (d.data() as NotificationSettings).userId,
  ).filter((uid) => fullMemberUids.has(uid));

  if (settingsUids.length > 0) {
    const tokens = await getTokensForUsers(householdId, settingsUids);
    if (tokens.length > 0) {
      await sendToMany(
        householdId,
        tokens,
        buildMessagePayload({
          type: 'category_warning',
          title: notification.title,
          body: notification.body,
          householdId,
          deepLink: '/budget',
        }),
      );
    }
  }

  // Mark fired keys
  const updatedWarningFor = {
    ...(state.lastWarningFor ?? {}),
  };
  const todayStr = todayInTz(today, 'UTC');
  for (const key of keysToFire) {
    updatedWarningFor[key] = todayStr;
  }
  await householdStateRef.set({ lastWarningFor: updatedWarningFor }, { merge: true });
}
