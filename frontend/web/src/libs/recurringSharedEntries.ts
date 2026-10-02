import { httpsCallable } from 'firebase/functions';
import type { Household, HouseholdMember, RecurringSharedEntryRule, RecurringFrequency, SharedBalanceEntry } from '@kippa/domain';
import { functions } from '@/config/firebase';
import { dbLib } from '@/libs/db';
import { computeSharedBalance } from '@/libs/sharedBalance';
import type { SpaceAccountsSummary } from '@/libs/spaceSummary';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions is not configured.');
  return functions;
}

export type RecurringRuleAction = 'create' | 'edit' | 'pause' | 'resume' | 'cancel';

export type RecurringRuleInput = {
  kind: SharedBalanceEntry['kind'];
  direction: 'caller_paid' | 'counterparty_paid';
  counterpartyUid: string;
  amount: number;
  currency: string;
  typeLabel: string;
  note: string | null;
  frequency: RecurringFrequency;
  anchorDate: string;
  endDate?: string | null;
  maxOccurrences?: number | null;
};

export const recurringSharedEntriesLib = {
  async getRules(householdId: string): Promise<RecurringSharedEntryRule[]> {
    const rules = await dbLib.getDocs(householdId, 'recurringSharedEntryRules') as RecurringSharedEntryRule[];
    return rules.sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0));
  },

  async upsert(input: { householdId: string; action: RecurringRuleAction; ruleId?: string; rule?: RecurringRuleInput }): Promise<string> {
    const callable = httpsCallable<typeof input, { ruleId: string }>(
      requireFunctions(),
      'upsertRecurringSharedEntryRule',
    );
    return (await callable(input)).data.ruleId;
  },
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ordinal(day: number): string {
  const remainder10 = day % 10;
  const remainder100 = day % 100;
  if (remainder10 === 1 && remainder100 !== 11) return `${day}st`;
  if (remainder10 === 2 && remainder100 !== 12) return `${day}nd`;
  if (remainder10 === 3 && remainder100 !== 13) return `${day}rd`;
  return `${day}th`;
}

/** "Monthly on the 5th" / "Every Thursday" / "Every year on 5 Mar" — UTC day math. */
export function formatFrequencyPhrase(rule: Pick<RecurringSharedEntryRule, 'frequency' | 'anchorDate'>): string {
  const date = new Date(`${rule.anchorDate}T12:00:00Z`);
  if (rule.frequency === 'weekly') return `Every ${WEEKDAYS[date.getUTCDay()]}`;
  if (rule.frequency === 'yearly') {
    return `Every year on ${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
  }
  return `Monthly on the ${ordinal(date.getUTCDate())}`;
}

/** Next occurrence strictly after fromIso, or null past endDate/maxOccurrences. */
export function nextOccurrenceAfter(
  rule: Pick<RecurringSharedEntryRule, 'frequency' | 'anchorDate' | 'endDate' | 'maxOccurrences' | 'occurrencesCreated' | 'lastOccurrenceDate'>,
  fromIso = new Date().toISOString().slice(0, 10),
): string | null {
  const step = (dateIso: string): string => {
    if (rule.frequency === 'weekly') {
      const time = new Date(`${dateIso}T12:00:00Z`).getTime() + 7 * 86_400_000;
      return new Date(time).toISOString().slice(0, 10);
    }
    const [y, m, d] = dateIso.split('-').map(Number);
    const monthsToAdd = rule.frequency === 'monthly' ? 1 : 12;
    const total = y * 12 + (m - 1) + monthsToAdd;
    const ny = Math.floor(total / 12);
    const nm = (total % 12) + 1;
    const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
  };

  // Start from the last materialized occurrence (the anchor when nothing has
  // been created yet) so "next" never points at an entry that already exists.
  const floor = rule.lastOccurrenceDate && rule.lastOccurrenceDate > rule.anchorDate
    ? rule.lastOccurrenceDate
    : rule.anchorDate;
  let current = floor;
  let index = Math.max(1, rule.occurrencesCreated || 1);
  let guard = 0;
  while (current <= fromIso && guard < 20_000) {
    guard += 1;
    current = step(current);
    index += 1;
  }
  if (current <= fromIso) return null;
  if (rule.endDate && current > rule.endDate) return null;
  if (rule.maxOccurrences != null && index > rule.maxOccurrences) return null;
  return current;
}

/** One hub row per space. */
export type SharedAccountSummary = {
  household: Household;
  members: HouseholdMember[];
  balance: number;
  pendingForMe: number;
  lastActivity: string;
  accountsSummary: SpaceAccountsSummary;
};

/**
 * Derives hub card data and sorts by most recent entry activity (quiet
 * accounts — no entries at all — sink to the bottom).
 */
export function summarizeSharedAccounts(
  input: { household: Household; entries: SharedBalanceEntry[]; members: HouseholdMember[]; accountsSummary: SpaceAccountsSummary }[],
  viewerUid: string,
): SharedAccountSummary[] {
  return input
    .map(({ household, entries, members, accountsSummary }) => ({
      household,
      members,
      accountsSummary,
      balance: computeSharedBalance(entries, viewerUid),
      pendingForMe: entries.filter((entry) => entry.status === 'pending' && entry.createdBy !== viewerUid).length,
      lastActivity: entries.reduce((latest, entry) => (entry.updatedAt > latest ? entry.updatedAt : latest), ''),
    }))
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}
