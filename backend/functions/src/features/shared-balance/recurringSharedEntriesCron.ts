import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { RecurringSharedEntryRule } from '@kippa/domain';
import { dueOccurrenceDates } from '../../domain/shared-balance/recurring.js';
import { getMemberProfileInHousehold, getUserProfile } from '../../libs/householdAccess.js';
import { materializeOccurrence, notifyCounterpartyOfOccurrences, notifyUser } from './sharedBalance.js';

const MAX_OCCURRENCES_PER_RULE_PER_RUN = 13;

/**
 * Daily at 00:30 UTC — materializes each due recurring-rule occurrence as a
 * PENDING shared-balance entry and notifies the counterparty. Backfills any
 * dates missed by earlier runs (bounded per rule per run); deterministic entry
 * ids make reruns idempotent. Per-rule failures are logged and never block the
 * other rules.
 */
export const recurringSharedEntriesCron = onSchedule('30 0 * * *', async () => {
  const db = getFirestore();
  const todayIso = new Date().toISOString().slice(0, 10);
  const rulesSnap = await db
    .collectionGroup('recurringSharedEntryRules')
    .where('status', '==', 'active')
    .get();

  for (const ruleDoc of rulesSnap.docs) {
    const rule = ruleDoc.data() as RecurringSharedEntryRule;
    try {
      await processRule(db, rule, ruleDoc.ref, todayIso);
    } catch (error) {
      console.error(`recurring rule ${rule.id} (household ${rule.householdId}) failed`, error);
    }
  }
});

async function processRule(
  db: Firestore,
  rule: RecurringSharedEntryRule,
  ruleRef: FirebaseFirestore.DocumentReference,
  todayIso: string,
): Promise<void> {
  const dates = dueOccurrenceDates(rule, todayIso, MAX_OCCURRENCES_PER_RULE_PER_RUN);
  if (dates.length === 0) return;

  const counterpartyUid = rule.createdBy === rule.fromUid ? rule.toUid : rule.fromUid;
  const author = await getUserProfile(rule.createdBy);
  const counterpartyProfile = await getMemberProfileInHousehold(counterpartyUid, rule.householdId);

  if (!author || !counterpartyProfile) {
    // Counterparty left the shared account (or the author's profile is gone) —
    // pause the rule instead of piling up orphaned pending entries.
    await ruleRef.set({ status: 'paused', updatedAt: Date.now() }, { merge: true });
    if (author) {
      await notifyUser(
        rule.householdId,
        rule.createdBy,
        'Recurring entry paused',
        `"${rule.typeLabel}" was paused because the other member is no longer in this space.`,
        '/shared-balance',
      );
    }
    return;
  }

  let created = 0;
  for (const dateIso of dates) {
    const didCreate = await materializeOccurrence(
      db,
      rule,
      dateIso,
      author.displayName || 'User',
      counterpartyProfile.displayName || 'User',
    );
    if (didCreate) created += 1;
  }
  if (created > 0) {
    await notifyCounterpartyOfOccurrences(rule.householdId, counterpartyUid, rule, created);
  }
}
