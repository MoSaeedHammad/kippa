import { randomUUID } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Account, Household, NotificationSettings, RecurringSharedEntryRule, SharedBalanceEntry, UserProfile } from '@kippa/domain';
import {
  buildSharedBalanceEntry,
  occurrenceEntryId,
  validateRecurringRuleInput,
} from '../../domain/shared-balance/recurring.js';
import {
  buildSharedBalanceMirror,
  counterpartyOf,
  isCounterparty,
  validateSharedBalanceEntryEdits,
  validateSharedBalanceEntryInput,
  type NormalizedSharedBalanceInput,
} from '../../domain/shared-balance/sharedBalance.js';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';
import { getMemberProfileInHousehold, requireHouseholdMember } from '../../libs/householdAccess.js';

/**
 * Virtual adjustment account that receives the posted mirror of every
 * approved shared-balance entry. Single deterministic id per household;
 * positive balance = the other member owes the household owner.
 */
const SHARED_BALANCE_ACCOUNT_ID = 'shared_balance';

function kindLabel(kind: SharedBalanceEntry['kind']): string {
  return kind === 'iou' ? 'IOU' : kind === 'split' ? 'Split' : 'Repayment';
}

async function ensureSharedBalanceAccount(
  householdId: string,
  currency: string,
  now: string,
): Promise<void> {
  const ref = getFirestore().doc(`households/${householdId}/accounts/${SHARED_BALANCE_ACCOUNT_ID}`);
  const snapshot = await ref.get();
  if (snapshot.exists) return;
  const account: Account = {
    id: SHARED_BALANCE_ACCOUNT_ID,
    householdId,
    name: 'Shared balance',
    type: 'adjustment',
    currency,
    isActive: true,
    sortOrder: 1000,
    createdAt: now,
    isSharedBalance: true,
  };
  await ref.set(account, { merge: true });
}

export async function notifyUser(
  householdId: string,
  uid: string,
  title: string,
  body: string,
  deepLink: string,
  type: 'shared_balance' | 'recurring_shared_entry' = 'shared_balance',
): Promise<void> {
  try {
    const tokens = await getTokensForUsers(householdId, [uid]);
    if (tokens.length === 0) return;
    await sendToMany(
      householdId,
      tokens,
      buildMessagePayload({ type, title, body, householdId, deepLink }),
    );
  } catch (error) {
    console.error('Could not send shared-balance notification', error);
  }
}

async function writeAudit(
  householdId: string,
  profile: UserProfile,
  action: string,
  summary: string,
  details: Record<string, unknown>,
  id: string,
): Promise<void> {
  await getFirestore().doc(`households/${householdId}/auditLog/${id}`).set({
    id,
    householdId,
    userId: profile.uid,
    userDisplayName: profile.displayName || 'User',
    userPhotoURL: profile.photoURL ?? null,
    action,
    summary,
    details,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Creates one pending entry for a recurring-rule occurrence (deterministic id,
 * so a rerun is a no-op). Shared by the upsert callable (first occurrence) and
 * the daily cron. Returns true when the occurrence was newly created.
 */
export async function materializeOccurrence(
  db: Firestore,
  rule: RecurringSharedEntryRule,
  dateIso: string,
  authorDisplayName: string,
  counterpartyDisplayName: string,
): Promise<boolean> {
  const entryId = occurrenceEntryId(rule.id, dateIso);
  const entryRef = db.doc(`households/${rule.householdId}/sharedBalanceEntries/${entryId}`);
  const ruleRef = db.doc(`households/${rule.householdId}/recurringSharedEntryRules/${rule.id}`);
  let created = false;
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(entryRef);
    if (existing.exists) return;
    const now = new Date().toISOString();
    transaction.create(
      entryRef,
      buildSharedBalanceEntry({
        id: entryId,
        householdId: rule.householdId,
        kind: rule.kind,
        fromUid: rule.fromUid,
        toUid: rule.toUid,
        amount: rule.amount,
        currency: rule.currency,
        typeLabel: rule.typeLabel,
        note: rule.note ?? null,
        date: dateIso,
        createdBy: rule.createdBy,
        authorDisplayName,
        counterpartyDisplayName,
        recurringRuleId: rule.id,
        now,
      }),
    );
    transaction.update(ruleRef, {
      occurrencesCreated: FieldValue.increment(1),
      lastOccurrenceDate: dateIso,
    });
    created = true;
  });
  return created;
}

/**
 * Proposes a shared-balance entry (IOU, split or repayment). The entry stays
 * pending until the counterparty approves it — only then does it count toward
 * the balance and mirror into the main ledger.
 */
export const proposeSharedBalanceEntry = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const householdId = typeof (request.data as { householdId?: unknown })?.householdId === 'string'
    ? (request.data as { householdId: string }).householdId.trim()
    : '';
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  const author = await requireHouseholdMember(uid, householdId);

  const todayIso = new Date().toISOString().slice(0, 10);
  const normalized: NormalizedSharedBalanceInput | null = (() => {
    const result = validateSharedBalanceEntryInput(request.data, uid, todayIso);
    if (!result.ok) throw new HttpsError('invalid-argument', result.error);
    return result.value;
  })();

  const counterpartyProfile = await getMemberProfileInHousehold(normalized.toUid === uid ? normalized.fromUid : normalized.toUid, householdId);
  if (!counterpartyProfile) {
    throw new HttpsError('failed-precondition', 'The counterparty must be a member of this space.');
  }

  const db = getFirestore();
  const now = new Date().toISOString();
  const entryId = `sb_${randomUUID()}`;
  const entry = buildSharedBalanceEntry({
    id: entryId,
    householdId,
    kind: normalized.kind,
    fromUid: normalized.fromUid,
    toUid: normalized.toUid,
    amount: normalized.amount,
    currency: normalized.currency,
    typeLabel: normalized.typeLabel,
    note: normalized.note,
    date: normalized.date,
    createdBy: uid,
    authorDisplayName: author.displayName || 'User',
    counterpartyDisplayName: counterpartyProfile.displayName || 'User',
    recurringRuleId: null,
    now,
  });
  await db.doc(`households/${householdId}/sharedBalanceEntries/${entryId}`).set(entry);
  await writeAudit(
    householdId,
    author,
    'shared_balance_proposed',
    `${author.displayName || 'User'} proposed ${kindLabel(entry.kind)}: ${entry.amount} ${entry.currency} (${entry.typeLabel}) — waiting for approval`,
    { entryId, kind: entry.kind, amount: entry.amount, currency: entry.currency, counterpartyUid: counterpartyOf(entry) },
    `sb_proposed_${entryId}`,
  );
  await notifyUser(
    householdId,
    counterpartyOf(entry),
    `Approve ${kindLabel(entry.kind)}`,
    `${author.displayName || 'User'}: ${entry.amount} ${entry.currency} · ${entry.typeLabel}`,
    '/shared-balance',
  );
  return { entryId };
});

/**
 * Counterparty decision on a pending entry (approve/reject), author cancel,
 * or author edit (resetting the entry to pending; an approved entry's ledger
 * mirror is voided until the counterparty approves the new revision).
 */
export const decideSharedBalanceEntry = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as {
    householdId?: unknown;
    entryId?: unknown;
    action?: unknown;
    edits?: unknown;
  };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const entryId = typeof data.entryId === 'string' ? data.entryId.trim() : '';
  const action = data.action;
  if (!householdId || !entryId) throw new HttpsError('invalid-argument', 'householdId and entryId are required.');
  if (action !== 'approve' && action !== 'reject' && action !== 'cancel' && action !== 'edit') {
    throw new HttpsError('invalid-argument', "action must be approve, reject, cancel or edit.");
  }
  const caller = await requireHouseholdMember(uid, householdId);
  const db = getFirestore();
  const entryRef = db.doc(`households/${householdId}/sharedBalanceEntries/${entryId}`);
  const writeAuditIn = (
    txn: FirebaseFirestore.Transaction,
    id: string,
    auditAction: 'shared_balance_edited' | 'shared_balance_approved' | 'shared_balance_rejected' | 'shared_balance_cancelled',
    summary: string,
    details: Record<string, unknown>,
    now: string,
  ) => txn.set(db.doc(`households/${householdId}/auditLog/${id}`), {
    id,
    householdId,
    userId: uid,
    userDisplayName: caller.displayName || 'User',
    userPhotoURL: caller.photoURL ?? null,
    action: auditAction,
    summary,
    details,
    createdAt: now,
  });

  if (action === 'edit') {
    const edits = (() => {
      const result = validateSharedBalanceEntryEdits(data.edits);
      if (!result.ok) throw new HttpsError('invalid-argument', result.error);
      return result.value;
    })();
    let notified: SharedBalanceEntry['toUid'] | null = null;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(entryRef);
      if (!snapshot.exists) throw new HttpsError('not-found', 'Entry not found.');
      const entry = snapshot.data() as SharedBalanceEntry;
      if (entry.createdBy !== uid) {
        throw new HttpsError('permission-denied', 'Only the author can edit an entry.');
      }
      if (entry.status === 'rejected' || entry.status === 'cancelled') {
        throw new HttpsError('failed-precondition', `A ${entry.status} entry cannot be edited.`);
      }
      const now = new Date().toISOString();
      const wasApproved = entry.status === 'approved';
      const update: Partial<SharedBalanceEntry> = {
        ...edits,
        status: 'pending',
        revision: entry.revision + 1,
        decidedAt: null,
        decidedBy: null,
        updatedAt: now,
      };
      if (wasApproved && entry.mirrorTransactionId) {
        transaction.set(
          db.doc(`households/${householdId}/transactions/${entry.mirrorTransactionId}`),
          { status: 'voided', updatedAt: now },
          { merge: true },
        );
        update.mirrorTransactionId = null;
      }
      transaction.update(entryRef, update);
      notified = counterpartyOf(entry);
      writeAuditIn(
        transaction,
        `sb_edited_${entryId}_r${entry.revision + 1}`,
        'shared_balance_edited',
        `${caller.displayName || 'User'} edited ${kindLabel(entry.kind)}: ${edits.amount ?? entry.amount} ${entry.currency} — back to pending`,
        { entryId, revision: entry.revision + 1, wasApproved },
        now,
      );
    });
    if (notified) {
      await notifyUser(
        householdId,
        notified,
        'Entry updated',
        `${caller.displayName || 'User'} edited an entry — your approval is needed again.`,
        '/shared-balance',
      );
    }
    return { status: 'pending' as const };
  }

  let authorUid: string | null = null;
  let summaryText = '';
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entryRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Entry not found.');
    const entry = snapshot.data() as SharedBalanceEntry;
    if (entry.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Entry is already ${entry.status}.`);
    }
    const now = new Date().toISOString();

    if (action === 'cancel') {
      if (entry.createdBy !== uid) {
        throw new HttpsError('permission-denied', 'Only the author can cancel a pending entry.');
      }
      transaction.update(entryRef, { status: 'cancelled', decidedAt: now, decidedBy: uid, updatedAt: now });
      summaryText = `${caller.displayName || 'User'} cancelled ${kindLabel(entry.kind)}: ${entry.amount} ${entry.currency}`;
      writeAuditIn(transaction, `sb_cancelled_${entryId}`, 'shared_balance_cancelled', summaryText, { entryId }, now);
      authorUid = entry.createdBy;
      return;
    }

    // approve / reject — only the counterparty decides.
    if (!isCounterparty(entry, uid)) {
      throw new HttpsError('permission-denied', 'Only the counterparty can decide this entry.');
    }

    if (action === 'reject') {
      transaction.update(entryRef, { status: 'rejected', decidedAt: now, decidedBy: uid, updatedAt: now });
      summaryText = `${caller.displayName || 'User'} rejected ${kindLabel(entry.kind)}: ${entry.amount} ${entry.currency}`;
      writeAuditIn(transaction, `sb_rejected_${entryId}`, 'shared_balance_rejected', summaryText, { entryId }, now);
      authorUid = entry.createdBy;
      return;
    }

    // approve — mirror into the main ledger.
    const hhSnapshot = await transaction.get(db.doc(`households/${householdId}/householdInfo/info`));
    if (!hhSnapshot.exists) throw new HttpsError('failed-precondition', 'Space not found.');
    const household = hhSnapshot.data() as Household;
    const revision = entry.revision;
    const mirrorTransactionId = `mirror_${entryId}_r${revision}`;
    const mirror = buildSharedBalanceMirror(entry, {
      ownerUid: household.createdBy,
      sharedAccountId: SHARED_BALANCE_ACCOUNT_ID,
      transactionId: mirrorTransactionId,
      now,
    });
    transaction.create(db.doc(`households/${householdId}/transactions/${mirrorTransactionId}`), mirror.transaction);
    transaction.create(db.doc(`households/${householdId}/ledgerLines/${mirror.ledgerLine.id}`), mirror.ledgerLine);
    transaction.set(
      db.doc(`households/${householdId}/accounts/${SHARED_BALANCE_ACCOUNT_ID}`),
      {
        id: SHARED_BALANCE_ACCOUNT_ID,
        householdId,
        name: 'Shared balance',
        type: 'adjustment',
        currency: entry.currency,
        isActive: true,
        sortOrder: 1000,
        createdAt: now,
        isSharedBalance: true,
      },
      { merge: true },
    );
    transaction.update(entryRef, {
      status: 'approved',
      decidedAt: now,
      decidedBy: uid,
      updatedAt: now,
      mirrorTransactionId,
    });
    summaryText = `${caller.displayName || 'User'} approved ${kindLabel(entry.kind)}: ${entry.amount} ${entry.currency} (${entry.typeLabel})`;
    writeAuditIn(
      transaction,
      `sb_approved_${entryId}_r${revision}`,
      'shared_balance_approved',
      summaryText,
      { entryId, mirrorTransactionId, kind: entry.kind, amount: entry.amount, currency: entry.currency },
      now,
    );
    authorUid = entry.createdBy;
  });

  if (authorUid && authorUid !== uid) {
    const titles: Record<string, string> = {
      approve: 'Entry approved',
      reject: 'Entry declined',
      cancel: 'Entry cancelled',
    };
    await notifyUser(householdId, authorUid, titles[action] ?? 'Shared balance', summaryText, '/shared-balance');
  }
  return { status: action === 'approve' ? ('approved' as const) : action === 'reject' ? ('rejected' as const) : ('cancelled' as const) };
});

/**
 * Owner changes a member's access level (full <-> sharedBalanceOnly).
 * Takes effect immediately in firestore.rules.
 */
export const updateMemberAccessLevel = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; memberUid?: unknown; accessLevel?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const memberUid = typeof data.memberUid === 'string' ? data.memberUid.trim() : '';
  const accessLevel = data.accessLevel;
  if (!householdId || !memberUid) throw new HttpsError('invalid-argument', 'householdId and memberUid are required.');
  if (accessLevel !== 'full' && accessLevel !== 'sharedBalanceOnly') {
    throw new HttpsError('invalid-argument', "accessLevel must be 'full' or 'sharedBalanceOnly'.");
  }

  const db = getFirestore();
  const hhSnapshot = await db.doc(`households/${householdId}/householdInfo/info`).get();
  if (!hhSnapshot.exists) throw new HttpsError('not-found', 'Space not found.');
  const household = hhSnapshot.data() as Household;
  if (household.createdBy !== uid) {
    throw new HttpsError('permission-denied', 'Only the owner can change access levels.');
  }
  if (memberUid === household.createdBy) {
    throw new HttpsError('failed-precondition', 'The owner always has full access.');
  }
  const member = await getMemberProfileInHousehold(memberUid, householdId);
  if (!member) throw new HttpsError('not-found', 'That member is not part of this space.');

  await db.doc(`users/${memberUid}`).set(
    { [`memberships.${householdId}`]: { accessLevel } },
    { merge: true },
  );
  await writeAudit(
    householdId,
    { ...member, uid } as UserProfile,
    'member_access_updated',
    `Access level for ${member.displayName || 'member'} set to ${accessLevel === 'full' ? 'Full' : 'Shared balance only'}`,
    { memberUid, accessLevel },
    `access_${memberUid}_${Date.now()}`,
  );
  await notifyUser(
    householdId,
    memberUid,
    'Access level updated',
    accessLevel === 'full'
      ? 'You now have full access to the space.'
      : 'You now see the shared balance only.',
    '/household',
  );
  return { accessLevel };
});

/** Cap on concurrent active rules per household — sane bound on cron work. */
const MAX_ACTIVE_RULES_PER_HOUSEHOLD = 30;

/**
 * Pushes the counterparty one "recurring occurrence due" notification per
 * rule (mentions the count when several backfilled at once). Honors the
 * recurringEntriesEnabled setting; absent setting = enabled.
 */
export async function notifyCounterpartyOfOccurrences(
  householdId: string,
  counterpartyUid: string,
  rule: Pick<RecurringSharedEntryRule, 'typeLabel' | 'amount' | 'currency'>,
  count: number,
): Promise<void> {
  try {
    const settingsSnap = await getFirestore()
      .doc(`households/${householdId}/notificationSettings/${counterpartyUid}`)
      .get();
    const settings = settingsSnap.data() as Partial<NotificationSettings> | undefined;
    if (settings?.recurringEntriesEnabled === false) return;
    await notifyUser(
      householdId,
      counterpartyUid,
      'Recurring entry due',
      `${rule.typeLabel} · ${rule.amount} ${rule.currency}${count > 1 ? ` — ${count} entries` : ''} — confirm to update the balance`,
      '/shared-balance',
      'recurring_shared_entry',
    );
  } catch (error) {
    console.error('Could not send recurring-entry notification', error);
  }
}

/**
 * Creates / edits / pauses / resumes / cancels a recurring shared-balance
 * entry rule. Author-only for all non-create actions. On create, the first
 * occurrence (the anchor date) is materialized immediately as a pending entry;
 * the daily cron generates every later one.
 */
export const upsertRecurringSharedEntryRule = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  const data = request.data as { householdId?: unknown; action?: unknown; ruleId?: unknown; rule?: unknown };
  const householdId = typeof data.householdId === 'string' ? data.householdId.trim() : '';
  const action = data.action;
  if (!householdId) throw new HttpsError('invalid-argument', 'householdId is required.');
  if (action !== 'create' && action !== 'edit' && action !== 'pause' && action !== 'resume' && action !== 'cancel') {
    throw new HttpsError('invalid-argument', 'action must be create, edit, pause, resume or cancel.');
  }
  const author = await requireHouseholdMember(uid, householdId);
  const db = getFirestore();
  const todayIso = new Date().toISOString().slice(0, 10);
  const nowMs = Date.now();
  const summaryVerb: Record<typeof action, string> = {
    create: 'scheduled', edit: 'updated', pause: 'paused', resume: 'resumed', cancel: 'cancelled',
  };

  if (action === 'create') {
    const normalized = (() => {
      const result = validateRecurringRuleInput(data.rule, uid);
      if (!result.ok) throw new HttpsError('invalid-argument', result.error);
      return result.value;
    })();
    const counterpartyUid = normalized.fromUid === uid ? normalized.toUid : normalized.fromUid;
    const counterpartyProfile = await getMemberProfileInHousehold(counterpartyUid, householdId);
    if (!counterpartyProfile) {
      throw new HttpsError('failed-precondition', 'The counterparty must be a member of this space.');
    }
    const activeSnap = await db
      .collection(`households/${householdId}/recurringSharedEntryRules`)
      .where('status', '==', 'active')
      .count()
      .get();
    if (activeSnap.data().count >= MAX_ACTIVE_RULES_PER_HOUSEHOLD) {
      throw new HttpsError('failed-precondition', 'This space already has the maximum number of active recurring entries.');
    }
    const ruleId = `rsr_${randomUUID()}`;
    const rule: RecurringSharedEntryRule = {
      id: ruleId,
      householdId,
      ...normalized,
      status: 'active',
      createdBy: uid,
      occurrencesCreated: 0,
      lastOccurrenceDate: null,
      resumedDate: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    await db.doc(`households/${householdId}/recurringSharedEntryRules/${ruleId}`).set(rule);
    if (normalized.anchorDate <= todayIso) {
      await materializeOccurrence(db, rule, normalized.anchorDate, author.displayName || 'User', counterpartyProfile.displayName || 'User');
    }
    await writeAudit(
      householdId,
      author,
      'recurring_rule_updated',
      `${author.displayName || 'User'} scheduled a recurring ${kindLabel(normalized.kind)}: ${normalized.amount} ${normalized.currency} (${normalized.typeLabel})`,
      { ruleId, action, frequency: normalized.frequency, anchorDate: normalized.anchorDate },
      `rsr_audit_${ruleId}_${nowMs}`,
    );
    await notifyUser(
      householdId,
      counterpartyUid,
      'Recurring entry scheduled',
      `${author.displayName || 'User'}: ${normalized.amount} ${normalized.currency} · ${normalized.typeLabel} — confirm to update the balance`,
      '/shared-balance',
    );
    return { ruleId };
  }

  // edit | pause | resume | cancel — author only, on an existing rule.
  const ruleId = typeof data.ruleId === 'string' ? data.ruleId.trim() : '';
  if (!ruleId) throw new HttpsError('invalid-argument', 'ruleId is required.');
  const ruleRef = db.doc(`households/${householdId}/recurringSharedEntryRules/${ruleId}`);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ruleRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Recurring entry not found.');
    const rule = snapshot.data() as RecurringSharedEntryRule;
    if (rule.createdBy !== uid) {
      throw new HttpsError('permission-denied', 'Only the author can change a recurring entry.');
    }
    if (rule.status === 'cancelled') {
      throw new HttpsError('failed-precondition', 'A cancelled recurring entry cannot be changed.');
    }
    if (action === 'edit') {
      const normalized = (() => {
        const result = validateRecurringRuleInput(data.rule, uid);
        if (!result.ok) throw new HttpsError('invalid-argument', result.error);
        return result.value;
      })();
      transaction.update(ruleRef, { ...normalized, updatedAt: nowMs });
    } else if (action === 'pause') {
      transaction.update(ruleRef, { status: 'paused', updatedAt: nowMs });
    } else if (action === 'resume') {
      if (rule.status !== 'paused') {
        throw new HttpsError('failed-precondition', 'Only a paused recurring entry can be resumed.');
      }
      // Occurrences during the pause window are never backfilled.
      transaction.update(ruleRef, { status: 'active', resumedDate: todayIso, updatedAt: nowMs });
    } else {
      transaction.update(ruleRef, { status: 'cancelled', updatedAt: nowMs });
    }
  });
  await writeAudit(
    householdId,
    author,
    'recurring_rule_updated',
    `${author.displayName || 'User'} ${summaryVerb[action]} a recurring entry`,
    { ruleId, action },
    `rsr_audit_${ruleId}_${nowMs}`,
  );
  return { ruleId };
});
