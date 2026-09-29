# Multiple Shared Accounts + Recurring Entries — Design

**Date:** 2026-09-29
**Status:** Approved direction (user answered model questions; instructed to proceed to build + deploy for feedback)
**Scope:** Shared-accounts hub UI, per-account history filters, recurring shared-balance entries with pending confirmation (backend cron + callables + notifications).

## Goal

A user currently sees only one shared balance per household and must switch
households invisibly to reach other shared spaces. The work is:

1. A **Shared accounts hub**: one screen listing every household the user
   belongs to, each with its own isolated balance, member list, and pending
   count; create new shared accounts from here.
2. **Per-account history with year/month filtering** on the existing
   shared-balance entries list.
3. **Recurring entries**: income / expense / transfer (IOU / split /
   repayment) rules that materialize a **pending** entry per occurrence and
   notify the counterparty; confirming reflects it into the balance via the
   existing approval flow.

## Decisions (from user Q&A)

| Question | Decision |
| --- | --- |
| What is a shared account? | A household (unchanged). Work = surface all of them in one hub instead of hidden switching. |
| Meaning of income / expense / transfer | Net-owed entries: income = counterparty paid me (+), expense = I paid them (−), transfer = repayment between us. Reuses `iou` / `split` / `repayment` kinds. |
| Occurrence generation | Approach A — server-side daily cron materializes occurrences as pending entries and pushes FCM; works while everyone is offline; missed runs backfill. |
| Confirmation | Unchanged: counterparty approves the pending entry; approval posts the mirror transaction and moves the balance. |

## A. Data model

New subcollection `households/{hhId}/recurringSharedEntryRules/{ruleId}`:

```ts
interface RecurringSharedEntryRule {
  id: string;
  kind: 'iou' | 'split' | 'repayment';
  fromUid: string;            // provided the money
  toUid: string;              // owes fromUid
  amount: number;             // > 0
  currency: CurrencyCode;
  typeLabel: string;          // 1..40 chars, same label set as entries
  note?: string | null;       // <= 280 chars
  frequency: 'weekly' | 'monthly' | 'yearly';
  anchorDate: string;         // 'YYYY-MM-DD', first occurrence date
  endDate?: string | null;    // inclusive; null = never
  maxOccurrences?: number | null; // whichever limit hits first
  status: 'active' | 'paused' | 'cancelled';
  createdBy: string;          // rule author; author of generated entries
  occurrencesCreated: number;
  lastOccurrenceDate?: string | null;
  resumedDate?: string | null; // set on resume; occurrences before it are skipped
  createdAt: number;
  updatedAt: number;
}
```

`SharedBalanceEntry` gains `recurringRuleId?: string | null`. Generated
entries are structurally identical to manual ones: pending status,
counterparty approval, audit log, author edit (revision bump) flow, and the
mirror transaction posted on approval all reuse the existing machinery.

Firestore rules: `recurringSharedEntryRules` — read = any household member
(shared-balance-only members manage their own rules); write = false (all
writes via callables, same as `sharedBalanceEntries`). No composite index
needed (collection-group query on `status` uses the automatic single-field
index).

## B. Backend

**Shared entry-creation core.** Extract the propose core of
`proposeSharedBalanceEntry` (validate → pending entry → audit → FCM) into a
transaction-composable domain function. Callers: manual propose callable,
bank-message tag flow, recurring rule creation, recurring cron.

**`upsertRecurringSharedEntryRule` (callable).** One `action` field:
`create | edit | pause | resume | cancel`, mirroring the
`decideSharedBalanceEntry` pattern. Validation reuses entry validation plus:
counterparty must be a current household member ≠ caller; `endDate` ≥
`anchorDate`; cap of 30 active rules per household. On `create`, the first
occurrence (the anchor date) is materialized immediately as a pending entry
via the shared core, so the user sees it without waiting for the cron.
`pause/resume/cancel` are author-only; `edit` (author-only) validates like
create and bumps `updatedAt`. `resume` stamps `resumedDate` = today so the
paused period is never backfilled.

**`recurringSharedEntriesCron` (scheduled, daily 00:30 UTC).**
`dailyReminderCron` (09:00 UTC) is untouched. For every active rule
(collection-group query) compute all occurrence dates in
`[max(anchorDate, resumedDate ?? anchorDate), today]` (UTC) that have no
entry yet, bounded at 13 occurrences per rule per run (backfill continues
next run). Per occurrence:

- Entry id `sb_rc_{ruleId}_{YYYYMMDD}` — deterministic, so reruns are
  idempotent (existing doc → skip) and failed writes retry safely.
- Entry fields from the rule; `date` = occurrence date; `createdBy` =
  rule author; `recurringRuleId` = rule id.
- Rule updated (`occurrencesCreated`, `lastOccurrenceDate`) in the same
  transaction as the entry write.

**Recurrence math (pure domain, UTC day boundaries).** Weekly = anchor + 7k
days. Monthly = same day-of-month, clamped to the month's last day (31st →
Feb 28/29, etc.). Yearly = same MM-DD. `endDate` / `maxOccurrences` end
generation; `paused` rules generate nothing and do not backfill the paused
period.

**Notifications.** New payload type `recurring_shared_entry` via the
existing payload/deep-link plumbing. One push per rule per cron run (body
mentions the count when several occurrences backfilled), sent to the
counterparty. Approval/rejection pushes stay as they are today. New
notification-settings toggle `recurringEntriesEnabled` (default on when
absent), surfaced in the existing settings form.

**Guardrails.** If a rule's counterparty is no longer a household member,
the cron pauses the rule and notifies the author instead of creating orphaned
pending entries. Per-rule failures are caught and logged; other rules
continue.

## C. Frontend

**Shared accounts hub — new route `/shared-accounts`.**

- Card per household from `useUserHouseholds`: name, member names, my
  viewer-relative balance (`computeSharedBalance` over `getEntries(hhId)`),
  pending-for-me count badge. Sorted by most recent entry activity.
- "New shared account" → existing create-household flow.
- Tapping a card switches the active household (existing `switchHousehold`)
  and navigates to the detail page.
- `sharedBalanceOnly` members' nav points here as their main surface.

**Detail page = today's `SharedBalancePage`, enhanced:**

- Balance hero and pending-for-me chip unchanged.
- **History period filter**: year selector (years present in the entries,
  default current) + month selector (All months / specific month),
  client-side filtering of the fetched list — balance hero always shows the
  full approved balance, independent of the filter.
- **Recurring section**: rule list (label, amount + direction, frequency
  phrase like "Monthly on the 5th", next occurrence, status), pause/resume/
  cancel actions, hidden section header when no rules exist.
- **Add-entry dialog** gains a "Repeat" selector (Doesn't repeat / Weekly /
  Monthly / Yearly); the existing date field becomes the anchor when
  repeating. Repeat = `upsertRecurringSharedEntryRule` (which also creates
  the first pending entry); otherwise plain `propose`.

**React-query:** `useRecurringRules(hhId)`, `useUpsertRecurringRuleMutation`
(keys in `financeQueryKeys`, invalidate on success). Hub queries reuse
existing per-household entry/member fetchers.

**Design system:** any new visual treatments become named theme variants +
TS augmentation before use; icons via `AppIcon`; `sx` only for layout.

## D. Error handling

- Cron: per-rule try/catch, log and continue; deterministic ids make the
  next run a safe retry.
- Counterparty left household: auto-pause + notify author (see guardrails).
- Amount differs for one month: edit the pending occurrence (existing
  author-edit flow; counterparty re-approves).
- Offline client: hub/detail render from cached entries; balances are
  recomputed when connectivity returns (existing react-query behavior).

## E. Testing

- Backend domain (vitest, pure): occurrence-date generation (weekly /
  monthly clamp / yearly), backfill window + 13-occurrence bound, end
  conditions, deterministic id builder, rule validation, counterparty-left
  pause logic.
- Frontend libs: year/month filter function, hub balance aggregation,
  frequency phrase formatting ("Monthly on the 5th", "Every Monday"),
  dialog branch (propose vs upsert-rule).
- Component tests: filter control, rules list states.

## Out of scope

- Real pooled pot balances (net-owed model retained).
- Variable per-occurrence amounts (edit the pending occurrence instead).
- Biweekly / custom frequencies (weekly, monthly, yearly only).
- Migrating or changing existing shared-balance entries.
