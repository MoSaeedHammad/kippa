# Multiple Shared Accounts + Recurring Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface every shared account (household) in one hub with per-account balance + year/month-filtered history, and add recurring IOU/split/repayment rules that materialize pending entries daily and notify the counterparty for confirmation.

**Architecture:** Recurring rules live in `households/{hhId}/recurringSharedEntryRules`; a daily cron materializes each due occurrence as a pending `SharedBalanceEntry` (deterministic id, idempotent) and pushes FCM to the counterparty; approval reuses `decideSharedBalanceEntry` untouched. Frontend adds a `/shared-accounts` hub page and enhances the existing `/shared-balance` detail page with a period filter and a rules card.

**Tech Stack:** Firebase Functions v2 (Node 22, ESM), Firestore, React 19 + MUI + TanStack Query v5, vitest both sides, `@kippa/domain` for shared types.

## Global Constraints

- Backend pure logic goes in `backend/functions/src/domain/**` with colocated `*.test.ts` (vitest, no emulator). Callables stay thin.
- Frontend pure logic in `frontend/web/src/libs/*.ts` with colocated tests; queries via react-query; callables via `httpsCallable`.
- UI: named design-system variants only (no ad-hoc `sx` styling of appearance — `sx` for layout/positioning only); icons only via `@/components/AppIcon` exports.
- Dates are `YYYY-MM-DD` strings, UTC day boundaries, everywhere.
- Rules: `recurringSharedEntryRules` — read any household member, write false (callables only).
- Test commands: `npm run functions:test`, `npm run test` (web), `npm run typecheck`, `npm run lint`.

---

### Task 1: Domain types + backend recurrence math (TDD)

**Files:**
- Modify: `packages/domain/src/index.d.ts`
- Create: `backend/functions/src/domain/shared-balance/recurring.ts`
- Test: `backend/functions/src/domain/shared-balance/recurring.test.ts`

**Interfaces (produces, consumed by later tasks):**
- `RecurringFrequency = 'weekly' | 'monthly' | 'yearly'`, `RecurringSharedEntryRule` (domain types)
- `dueOccurrenceDates(rule, todayIso, cap = 13): string[]`
- `occurrenceEntryId(ruleId: string, dateIso: string): string`
- `validateRecurringRuleInput(raw, callerUid): ValidationResult<NormalizedRecurringRuleInput>`
- `buildSharedBalanceEntry(seed): SharedBalanceEntry`
- `SharedBalanceEntry.recurringRuleId?: string | null`, `NotificationSettings.recurringEntriesEnabled: boolean`, `AuditAction += 'recurring_rule_updated'`

- [ ] **Step 1: Domain types** — in `packages/domain/src/index.d.ts` add:

```ts
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
```

Add to `SharedBalanceEntry`: `recurringRuleId?: string | null;` (with doc comment "Set when the entry was materialized from a recurring rule."). Add to `NotificationSettings`: `recurringEntriesEnabled: boolean;`. Add `'recurring_rule_updated'` to `AuditAction`.

- [ ] **Step 2: Failing tests** — `backend/functions/src/domain/shared-balance/recurring.test.ts` covering: monthly clamp (2026-01-31 → 2026-02-28 → 2026-03-31; leap 2024-02-29 → 2025-02-28), weekly +7d, yearly same MM-DD, `dueOccurrenceDates` future-anchor → [], endDate cutoff, resumedDate floor, cap 13 (2024-01-05 monthly to 2026-09-29 → exactly 13, oldest first), `occurrenceEntryId('rsr_x','2026-03-05') === 'sb_rc_rsr_x_20260305'`, `validateRecurringRuleInput` rejects bad frequency / endDate < anchorDate / maxOccurrences 0 or 1001 / bad amount, maps direction caller_paid → fromUid=caller, `buildSharedBalanceEntry` sets status pending, revision 1, recurringRuleId passthrough, display names.

- [ ] **Step 3: Run** `npm run functions:test` — new file FAILS (module missing).

- [ ] **Step 4: Implement** `recurring.ts`:

```ts
import type { RecurringFrequency, RecurringSharedEntryRule, SharedBalanceEntry, SharedBalanceEntryKind } from '@kippa/domain';
import { validateSharedBalanceEntryInput, type ValidationResult } from './sharedBalance.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIso(dateIso: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateIso.split('-').map(Number);
  return { y, m, d };
}
function toIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Same day-of-month k months later, clamped to the month's last day (31st → Feb 28/29). */
export function addMonthsClamped(dateIso: string, months: number): string {
  const { y, m, d } = parseIso(dateIso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return toIso(ny, nm, Math.min(d, lastDay));
}
export function addDaysIso(dateIso: string, days: number): string {
  const t = new Date(`${dateIso}T12:00:00Z`).getTime() + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
export function addYearsClamped(dateIso: string, years: number): string {
  return addMonthsClamped(dateIso, years * 12);
}

/**
 * Occurrence dates the rule should have materialized, oldest first:
 * the series from anchorDate through todayIso (UTC), starting no earlier than
 * resumedDate, respecting endDate. Caller applies the per-run cap.
 */
export function seriesDatesUntil(
  rule: Pick<RecurringSharedEntryRule, 'anchorDate' | 'frequency' | 'endDate' | 'resumedDate'>,
  todayIso: string,
): string[] {
  const floor = rule.resumedDate && rule.resumedDate > rule.anchorDate ? rule.resumedDate : rule.anchorDate;
  const dates: string[] = [];
  let current = rule.anchorDate;
  let guard = 0;
  while (current <= todayIso && guard < 20_000) {
    guard += 1;
    if (current >= floor && (!rule.endDate || current <= rule.endDate)) dates.push(current);
    current =
      rule.frequency === 'weekly' ? addDaysIso(current, 7)
        : rule.frequency === 'monthly' ? addMonthsClamped(current, 1)
          : addYearsClamped(current, 1);
  }
  return dates;
}

/** Bounded window of due occurrence dates for one cron run, honoring maxOccurrences. */
export function dueOccurrenceDates(
  rule: Pick<RecurringSharedEntryRule, 'anchorDate' | 'frequency' | 'endDate' | 'resumedDate' | 'maxOccurrences' | 'occurrencesCreated'>,
  todayIso: string,
  cap = 13,
): string[] {
  const dates = seriesDatesUntil(rule, todayIso);
  const remaining = rule.maxOccurrences != null
    ? Math.max(0, rule.maxOccurrences - rule.occurrencesCreated)
    : dates.length;
  return dates.slice(0, Math.min(cap, remaining));
}

/** Deterministic entry id — makes cron reruns idempotent. */
export function occurrenceEntryId(ruleId: string, dateIso: string): string {
  return `sb_rc_${ruleId}_${dateIso.replace(/-/g, '')}`;
}

export type NormalizedRecurringRuleInput = {
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  frequency: RecurringFrequency;
  anchorDate: string;
  endDate: string | null;
  maxOccurrences: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Validates rule creation/edit input; reuses entry validation for shared fields. */
export function validateRecurringRuleInput(raw: unknown, callerUid: string): ValidationResult<NormalizedRecurringRuleInput> {
  if (!isRecord(raw)) return { ok: false, error: 'Invalid request body.' };
  const frequency = raw.frequency;
  if (frequency !== 'weekly' && frequency !== 'monthly' && frequency !== 'yearly') {
    return { ok: false, error: 'frequency must be weekly, monthly or yearly.' };
  }
  const anchorDate = typeof raw.anchorDate === 'string' ? raw.anchorDate.trim() : '';
  if (!ISO_DATE.test(anchorDate) || Number.isNaN(new Date(`${anchorDate}T12:00:00Z`).getTime())) {
    return { ok: false, error: 'anchorDate must be a YYYY-MM-DD calendar date.' };
  }
  let endDate: string | null = null;
  if (raw.endDate != null) {
    if (typeof raw.endDate !== 'string' || !ISO_DATE.test(raw.endDate)) {
      return { ok: false, error: 'endDate must be a YYYY-MM-DD calendar date.' };
    }
    if (raw.endDate < anchorDate) return { ok: false, error: 'endDate cannot be before the anchor date.' };
    endDate = raw.endDate;
  }
  let maxOccurrences: number | null = null;
  if (raw.maxOccurrences != null) {
    if (typeof raw.maxOccurrences !== 'number' || !Number.isInteger(raw.maxOccurrences) || raw.maxOccurrences < 1 || raw.maxOccurrences > 1000) {
      return { ok: false, error: 'maxOccurrences must be an integer between 1 and 1000.' };
    }
    maxOccurrences = raw.maxOccurrences;
  }
  const entryResult = validateSharedBalanceEntryInput({ ...raw, date: anchorDate }, callerUid, anchorDate);
  if (!entryResult.ok) return entryResult;
  const { kind, fromUid, toUid, amount, currency, typeLabel, note } = entryResult.value;
  return { ok: true, value: { kind, fromUid, toUid, amount, currency, typeLabel, note, frequency, anchorDate, endDate, maxOccurrences } };
}

export type SharedBalanceEntrySeed = {
  id: string;
  householdId: string;
  kind: SharedBalanceEntryKind;
  fromUid: string;
  toUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  date: string;
  createdBy: string;
  authorDisplayName: string;
  counterpartyDisplayName: string;
  recurringRuleId?: string | null;
  now: string;
};

/** Single builder for pending shared-balance entries (manual propose + recurring cron). */
export function buildSharedBalanceEntry(seed: SharedBalanceEntrySeed): SharedBalanceEntry {
  const fromIsAuthor = seed.fromUid === seed.createdBy;
  return {
    id: seed.id,
    householdId: seed.householdId,
    kind: seed.kind,
    fromUid: seed.fromUid,
    toUid: seed.toUid,
    amount: seed.amount,
    currency: seed.currency,
    typeLabel: seed.typeLabel,
    note: seed.note,
    date: seed.date,
    status: 'pending',
    createdBy: seed.createdBy,
    revision: 1,
    mirrorTransactionId: null,
    sourceTransactionId: null,
    sourcePendingId: null,
    recurringRuleId: seed.recurringRuleId ?? null,
    fromDisplayName: fromIsAuthor ? seed.authorDisplayName : seed.counterpartyDisplayName,
    toDisplayName: fromIsAuthor ? seed.counterpartyDisplayName : seed.authorDisplayName,
    createdAt: seed.now,
    updatedAt: seed.now,
    decidedAt: null,
    decidedBy: null,
  };
}
```

- [ ] **Step 5: Run** `npm run functions:test` — PASS (all files). **Step 6: Commit** `feat(domain): recurring shared-balance rule types, recurrence math, entry builder`.

### Task 2: `upsertRecurringSharedEntryRule` callable + propose refactor

**Files:**
- Modify: `backend/functions/src/features/shared-balance/sharedBalance.ts` (refactor `proposeSharedBalanceEntry` to use `buildSharedBalanceEntry`; add callable)
- Modify: `backend/functions/src/index.ts` (export `upsertRecurringSharedEntryRule`)
- Test: extend `backend/functions/src/domain/shared-balance/recurring.test.ts` only (callable logic stays thin; validation already covered)

**Interfaces:** Callable payload `{ householdId, action: 'create'|'edit'|'pause'|'resume'|'cancel', ruleId?, rule? }` → `{ ruleId }`. Create payload's `rule` = the raw validate input (kind, direction, counterpartyUid, amount, currency, typeLabel, note, frequency, anchorDate, endDate?, maxOccurrences?).

- [ ] **Step 1:** In `features/shared-balance/sharedBalance.ts`, replace the inline entry construction in `proposeSharedBalanceEntry` with `buildSharedBalanceEntry({ id: entryId, householdId, ...normalized, createdBy: uid, authorDisplayName: author.displayName || 'User', counterpartyDisplayName: counterpartyProfile.displayName || 'User', recurringRuleId: null, now })`. Verify tests still pass.
- [ ] **Step 2:** Add the callable (same file):

```ts
const MAX_ACTIVE_RULES_PER_HOUSEHOLD = 30;

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
  const summaryVerb = { create: 'scheduled', edit: 'updated', pause: 'paused', resume: 'resumed', cancel: 'cancelled' }[action];

  if (action === 'create') {
    const normalized = (() => {
      const result = validateRecurringRuleInput(data.rule, uid);
      if (!result.ok) throw new HttpsError('invalid-argument', result.error);
      return result.value;
    })();
    const counterpartyUid = normalized.fromUid === uid ? normalized.toUid : normalized.fromUid;
    const counterpartyProfile = await getMemberProfileInHousehold(counterpartyUid, householdId);
    if (!counterpartyProfile) throw new HttpsError('failed-precondition', 'The counterparty must be a member of this shared account.');
    const activeSnap = await db.collection(`households/${householdId}/recurringSharedEntryRules`).where('status', '==', 'active').count().get();
    if (activeSnap.data().count >= MAX_ACTIVE_RULES_PER_HOUSEHOLD) {
      throw new HttpsError('failed-precondition', 'This shared account already has the maximum number of active recurring entries.');
    }
    const ruleId = `rsr_${randomUUID()}`;
    const rule: RecurringSharedEntryRule = {
      id: ruleId, householdId, ...normalized,
      status: 'active', createdBy: uid,
      occurrencesCreated: 0, lastOccurrenceDate: null, resumedDate: null,
      createdAt: nowMs, updatedAt: nowMs,
    };
    await db.doc(`households/${householdId}/recurringSharedEntryRules/${ruleId}`).set(rule);
    // First occurrence materialized immediately so the user sees it now;
    // the cron handles every date after the anchor.
    if (normalized.anchorDate <= todayIso) {
      await materializeOccurrence(db, rule, normalized.anchorDate, author.displayName || 'User', counterpartyProfile.displayName || 'User');
    }
    await writeAudit(householdId, author, 'recurring_rule_updated',
      `${author.displayName || 'User'} scheduled a recurring ${kindLabel(normalized.kind)}: ${normalized.amount} ${normalized.currency} ${summaryVerb}`,
      { ruleId, action }, `rsr_audit_${ruleId}_${nowMs}`);
    await notifyUser(householdId, counterpartyUid, 'Recurring entry scheduled',
      `${author.displayName || 'User'}: ${normalized.amount} ${normalized.currency} · ${normalized.typeLabel} — confirm to update the balance`,
      '/shared-balance');
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
    if (rule.createdBy !== uid) throw new HttpsError('permission-denied', 'Only the author can change a recurring entry.');
    if (rule.status === 'cancelled') throw new HttpsError('failed-precondition', 'A cancelled recurring entry cannot change.');
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
      if (rule.status !== 'paused') throw new HttpsError('failed-precondition', 'Only a paused recurring entry can resume.');
      transaction.update(ruleRef, { status: 'active', resumedDate: todayIso, updatedAt: nowMs });
    } else {
      transaction.update(ruleRef, { status: 'cancelled', updatedAt: nowMs });
    }
  });
  await writeAudit(householdId, author, 'recurring_rule_updated',
    `${author.displayName || 'User'} ${summaryVerb} a recurring entry`,
    { ruleId, action }, `rsr_audit_${ruleId}_${nowMs}`);
  return { ruleId };
});
```

Extract `materializeOccurrence(db, rule, dateIso, authorDisplayName, counterpartyDisplayName)` in this file so the cron reuses it (Task 3): builds `occurrenceEntryId`, transaction { entryRef.get → skip if exists; create entry via `buildSharedBalanceEntry`; update rule `{ occurrencesCreated: FieldValue.increment(1), lastOccurrenceDate: dateIso }` } → returns boolean created.

- [ ] **Step 3:** `npm run functions:test` PASS + `npm run functions:build` (typecheck). **Step 4: Commit** `feat(functions): upsertRecurringSharedEntryRule callable + shared entry builder`.

### Task 3: Daily cron `recurringSharedEntriesCron` + notification payload type

**Files:**
- Create: `backend/functions/src/features/shared-balance/recurringSharedEntriesCron.ts`
- Modify: `backend/functions/src/domain/notifications/payload.ts` (`NotificationType += 'recurring_shared_entry'`)
- Modify: `backend/functions/src/index.ts` (export)

- [ ] **Step 1: payload.ts** — add `'recurring_shared_entry'` to the `NotificationType` union.
- [ ] **Step 2: cron:**

```ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { NotificationSettings, RecurringSharedEntryRule } from '@kippa/domain';
import { dueOccurrenceDates } from '../../domain/shared-balance/recurring.js';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';
import { getMemberProfileInHousehold, getUserProfile } from '../../libs/householdAccess.js';
import { kindLabel, materializeOccurrence, notifyCounterpartyOfOccurrences } from './sharedBalance.js';

const MAX_OCCURRENCES_PER_RULE_PER_RUN = 13;

/**
 * Daily at 00:30 UTC — materializes each due recurring-rule occurrence as a
 * PENDING shared-balance entry and notifies the counterparty. Backfills any
 * dates missed by earlier runs (bounded per rule per run); deterministic entry
 * ids make reruns idempotent.
 */
export const recurringSharedEntriesCron = onSchedule('30 0 * * *', async () => {
  const db = getFirestore();
  const todayIso = new Date().toISOString().slice(0, 10);
  const rulesSnap = await db.collectionGroup('recurringSharedEntryRules').where('status', '==', 'active').get();
  for (const ruleDoc of rulesSnap.docs) {
    const rule = ruleDoc.data() as RecurringSharedEntryRule;
    try {
      await processRule(db, rule, ruleDoc.ref, todayIso);
    } catch (error) {
      console.error(`recurring rule ${rule.id} (household ${rule.householdId}) failed`, error);
    }
  }
});

async function processRule(db, rule, ruleRef, todayIso) {
  const dates = dueOccurrenceDates(rule, todayIso, MAX_OCCURRENCES_PER_RULE_PER_RUN);
  if (dates.length === 0) return;
  const counterpartyUid = rule.createdBy === rule.fromUid ? rule.toUid : rule.fromUid;
  const author = await getUserProfile(rule.createdBy);
  const counterpartyProfile = await getMemberProfileInHousehold(counterpartyUid, rule.householdId);
  if (!counterpartyProfile || !author) {
    // Counterparty left the shared account (or author deleted) — pause instead
    // of piling up orphaned pending entries.
    await ruleRef.set({ status: 'paused', updatedAt: Date.now() }, { merge: true });
    if (author) await notifyPaused(db, rule, author.displayName || 'User', counterpartyProfile ? null : counterpartyUid);
    return;
  }
  let created = 0;
  for (const dateIso of dates) {
    const did = await materializeOccurrence(db, rule, dateIso, author.displayName || 'User', counterpartyProfile.displayName || 'User');
    if (did) created += 1;
  }
  if (created > 0) await notifyCounterpartyOfOccurrences(rule.householdId, counterpartyUid, rule, created);
}
```

`notifyCounterpartyOfOccurrences(householdId, counterpartyUid, rule, count)` (exported from `features/shared-balance/sharedBalance.ts`, reused by the create flow): reads `notificationSettings/{counterpartyUid}` — skip push when `settings?.recurringEntriesEnabled === false`; else tokens → `sendToMany` with `buildMessagePayload({ type: 'recurring_shared_entry', title: 'Recurring entry due', body: \`${rule.typeLabel} · ${rule.amount} ${rule.currency}${count > 1 ? \` — ${count} entries\` : ''} — confirm to update the balance\`, householdId, deepLink: '/shared-balance' })`. `notifyPaused` pushes 'Recurring entry paused' to the author. All notification helpers wrapped in try/catch (log, never throw).

- [ ] **Step 3:** `npm run functions:test && npm run functions:build`. **Step 4: Commit** `feat(functions): daily cron materializes recurring shared-balance occurrences`.

### Task 4: Firestore rules + index wiring

**Files:**
- Modify: `firestore.rules`
- Modify: `backend/functions/src/index.ts` (already done in Tasks 2–3 — verify all three exports: `upsertRecurringSharedEntryRule`, `recurringSharedEntriesCron`)

- [ ] **Step 1:** Extend `isHouseholdMember` so members of ANY of their households pass (the hub reads entries across households while the active pointer may be elsewhere):

```
function isHouseholdMember(householdId) {
  return isSignedIn()
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.householdId == householdId
        || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('householdIds', []).hasAny([householdId]));
}
```

- [ ] **Step 2:** Add next to the `sharedBalanceEntries` match:

```
// Recurring shared-balance rules: any member reads (shared-balance-only
// members manage their own rules); every write goes through callables.
match /recurringSharedEntryRules/{ruleId} {
  allow read: if isHouseholdMember(householdId);
  allow write: if false;
}
```

and add `&& collectionName != 'recurringSharedEntryRules'` to the catch-all so full members cannot write rule docs directly. Update the exclusion comment list.

- [ ] **Step 3:** `npm run functions:build` sanity. **Step 4: Commit** `fix(rules): membership across householdIds + recurringSharedEntryRules access`.

### Task 5: Frontend libs + hooks (TDD)

**Files:**
- Create: `frontend/web/src/libs/entryHistoryFilter.ts` + `.test.ts`
- Create: `frontend/web/src/libs/recurringSharedEntries.ts` + `.test.ts`
- Create: `frontend/web/src/features/shared-balance/hooks/useRecurringRules.ts`

**Interfaces:** `filterEntriesByPeriod<T extends {date:string}>(items, {year:number|'all', month:number|'all'})`, `availableYears(items): number[]` (unique, desc); `recurringSharedEntriesLib.getRules(hhId)`, `.upsert(input)`; `formatFrequencyPhrase(rule)`; `nextOccurrenceAfter(rule, fromIso?)`; `summarizeSharedAccounts(summaries, viewerUid)` — sorts by latest entry `updatedAt` desc.

- [ ] **Step 1: Failing tests** — `entryHistoryFilter.test.ts`: filters by year, by year+month, `'all'` passthrough, empty list, availableYears unique desc. `recurringSharedEntries.test.ts`: `formatFrequencyPhrase` → monthly 2026-03-05 "Monthly on the 5th", 2026-03-21 "Monthly on the 21st", weekly 2026-03-05 (Thursday) "Every Thursday", yearly "Every year on 5 Mar"; `nextOccurrenceAfter` monthly clamp Jan-31 → Feb-28 when from=Feb-01; `summarizeSharedAccounts` sorts by newest entry, counts pending-for-me.
- [ ] **Step 2: Run** `npm run test -- --run src/libs` → FAIL. Implement the two libs (+ `useRecurringRules` with queryKey `['recurringRules', householdId]`, and `useUpsertRecurringRuleMutation` invalidating `['recurringRules', hhId]` + `['sharedBalanceEntries', hhId]`). Run → PASS.
- [ ] **Step 3: Commit** `feat(web): recurring rules lib, history period filter, hooks`.

### Task 6: Hub page `/shared-accounts` + routing/nav

**Files:**
- Create: `frontend/web/src/features/shared-accounts/SharedAccountsPage.tsx`
- Modify: `frontend/web/src/App.tsx` (route), `frontend/web/src/components/app-shell/SideNav.tsx`, `BottomNav.tsx`

- [ ] **Step 1:** `SharedAccountsPage.tsx`: `PageHeader title="Shared accounts" subtitle="Every shared space you belong to — each with its own balance and history." action=New shared account button` → name dialog → `createHousehold(name)` from context. One `useQuery` (`['sharedAccountSummaries', householdIds, uid]`) fetching per household: `sharedBalanceLib.getEntries(hh.id)` + `authLib.listHouseholdMembers(uid, hh.id)`; derive per card via `summarizeSharedAccounts`: name, member display names (first two + "+n"), balance `Money` in household `baseCurrency` colored success/error, `pendingForMe` count badge, "Active" chip on the active household. Card click → `await switchHousehold(hh.id)` → `navigate('/shared-balance')`. Layout: responsive `Box grid` (1col xs / 2col sm+), `Card variant="outlined"`, icons `SwapHorizIcon`/`AddIcon`/`SwitchAccountIcon` only. `sx` for layout only.
- [ ] **Step 2:** `App.tsx`: lazy route `shared-accounts`. `SideNav`: add `{ label: 'Shared accounts', path: '/shared-accounts' }` to Transactions children (before 'Shared balance'); `sharedBalanceOnlyMenu` gains a first item `{ label: 'Shared accounts', path: '/shared-accounts', icon: SwitchAccountIcon }`. `BottomNav` `SCOPED_LEFT_ITEMS` → `{ label: 'Accounts', path: '/shared-accounts', icon: <SwitchAccountIcon /> }`.
- [ ] **Step 3:** `npm run typecheck && npm run test`. **Step 4: Commit** `feat(web): shared-accounts hub listing every household with balance + pending`.

### Task 7: Detail page — period filter, recurring rules card, Repeat in dialog

**Files:**
- Create: `frontend/web/src/features/shared-balance/components/EntryHistoryFilter.tsx`
- Create: `frontend/web/src/features/shared-balance/components/RecurringRulesCard.tsx`
- Modify: `frontend/web/src/features/shared-balance/SharedBalancePage.tsx`, `components/AddSharedBalanceEntryDialog.tsx`

- [ ] **Step 1: `EntryHistoryFilter`** — two `TextField select`s ("Year": `All years` + `availableYears(entries)`; "Month": `All months` + Jan–Dec), default `{year: currentYear, month: 'all'}`. Page computes `visibleEntries = filterEntriesByPeriod(entries, filter)` and renders those; hero balance + pending chip stay unfiltered (spec). Entries card subtitle shows "Showing N of M entries" when filtered.
- [ ] **Step 2: `RecurringRulesCard`** — `useRecurringRules(householdId)`; hidden entirely when list empty. Each rule row: `typeLabel`, direction phrase ("You pay them" / "They pay you" from fromUid/toUid vs viewer), `Money` amount, `formatFrequencyPhrase`, "Next: {nextOccurrenceAfter}" (omit when paused/cancelled), status Chip for paused/cancelled; author-only icon buttons pause/resume/cancel via `useUpsertRecurringRuleMutation` with confirm on cancel. `SyncAltIcon` heading icon.
- [ ] **Step 3: Dialog Repeat** — new select shown when `!editing`: "Doesn't repeat" (default) / Weekly / Monthly / Yearly. `onSubmit` input gains `repeat: 'none'|'weekly'|'monthly'|'yearly'`. Page handler: `repeat === 'none'` → `proposeMutation`; else `upsertRecurringRuleMutation.create({ rule: {...input, frequency: repeat, anchorDate: date } })`, snackbar "Recurring entry scheduled — first entry sent for approval".
- [ ] **Step 4:** Component test `EntryHistoryFilter.test.tsx` (jsdom + Testing Library, mirroring `PendingReviewDialog.test.tsx` setup): renders year options from entries, changing year/month calls `onChange` with the right values. Then `npm run typecheck && npm run test && npm run lint`. **Step 5: Commit** `feat(web): history period filter, recurring rules card, repeat option in add dialog`.

### Task 8: Notification settings toggle

**Files:**
- Modify: `frontend/web/src/features/notifications/NotificationSettingsForm.tsx` (preferences array gains `{ key: 'recurringEntriesEnabled', title: 'Recurring entry confirmations', description: 'Ask me to confirm each recurring shared entry before it counts.', Icon: SyncAltIcon }`), `frontend/web/src/features/notifications/Notifications.tsx` (defaultSettings `recurringEntriesEnabled: true`)
- Server default-safe: cron skips push only when `=== false` (Task 3), so old docs without the field still notify.

- [ ] **Step 1:** edits above. **Step 2:** `npm run typecheck && npm run test`. **Step 3: Commit** `feat(web): recurring entry confirmation toggle in notification settings`.

### Task 9: Full verification

- [ ] `npm run functions:test` (all pass), `npm run test` (all pass), `npm run typecheck`, `npm run lint`. Fix anything; commit fixes.

### Task 10: Build + deploy

- [ ] `npm run build` (functions + web). Check `firebase.json` targets (hosting asset config from web build output).
- [ ] `firebase deploy --only functions,firestore:rules` — verify function list includes `upsertRecurringSharedEntryRule` (callable) and `recurringSharedEntriesCron` (scheduled).
- [ ] `firebase deploy --only hosting` (or single combined deploy) — capture the hosting URL.
- [ ] Smoke: `curl -s -o /dev/null -w "%{http_code}" https://<hosting-url>/` → 200.

### Task 11: Report to user

- [ ] Summarize what shipped, where to click (Shared accounts nav item → per-account page: filter + recurring), known limitations, ask for feedback.
