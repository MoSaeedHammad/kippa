import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import type { RecurringTransactionRule } from '@kippa/domain';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';
import { materializeRecurringTransactionOccurrences } from './recurringTransactions.js';

/**
 * Daily cron: materializes due occurrences of every active recurring
 * income/expense rule as draft transactions. A full member confirms or skips
 * each occurrence in the Approvals page.
 */
export const recurringTransactionsCron = onSchedule('45 0 * * *', async () => {
  const db = getFirestore();
  const todayIso = new Date().toISOString().slice(0, 10);
  const rulesSnap = await db.collectionGroup('recurringTransactionRules').where('status', '==', 'active').get();
  let failures = 0;

  for (const doc of rulesSnap.docs) {
    const rule = { ...doc.data() } as RecurringTransactionRule;
    try {
      const created = await materializeRecurringTransactionOccurrences(rule, todayIso);
      if (created > 0) {
        const tokens = await getTokensForUsers(rule.householdId, [rule.createdBy]);
        const settingsSnap = await db.doc(`households/${rule.householdId}/notificationSettings/${rule.createdBy}`).get();
        const enabled = (settingsSnap.data() as { recurringEntriesEnabled?: boolean } | undefined)?.recurringEntriesEnabled !== false;
        if (enabled && tokens.length > 0) {
          await sendToMany(
            rule.householdId,
            tokens,
            buildMessagePayload({
              type: 'recurring_transaction',
              title: 'Confirm recurring entry',
              body: `${rule.description} — ${created} ${created === 1 ? 'occurrence' : 'occurrences'} waiting in Approvals.`,
              householdId: rule.householdId,
              deepLink: '/pending',
            }),
          ).catch((error) => console.error('recurring transaction notification failed', error));
        }
      }
    } catch (error) {
      failures += 1;
      console.error(`recurring rule ${rule.id} failed`, error);
    }
  }
  if (failures > 0) console.warn(`recurringTransactionsCron finished with ${failures} rule failures`);
});
