import type { Account, Card } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';

export type Suggestions = {
  accountId?: string;
  destinationAccountId?: string;
  conversionRequired: boolean;
};

/**
 * Pure account/card suggestion logic for a parsed bank message. Firestore-free
 * so it can be unit tested; the ingestion function loads docs and delegates here.
 */
export function pickSuggestions(accounts: Account[], cards: Card[], parsed: ParsedFinancialMessage): Suggestions {
  const activeAccounts = accounts.filter((account) => account.isActive && account.currency === parsed.currency);
  const cardAccount = (hint: string | undefined, kind?: 'credit' | 'debit') => {
    const card = cards.find((candidate) => candidate.isActive
      && (!kind || candidate.kind === kind)
      && !!hint
      && candidate.last4 === hint);
    return card?.parentAccountId;
  };

  let accountId: string | undefined;
  if (parsed.accountKind === 'credit-card') {
    accountId = cardAccount(parsed.accountHintLast4, 'credit');
  } else {
    accountId = cardAccount(parsed.accountHintLast4, 'debit');
    if (!accountId && parsed.destinationKind !== 'bank') {
      const running = activeAccounts.filter((account) => account.type === 'running');
      if (running.length === 1) accountId = running[0].id;
    }
  }

  let destinationAccountId: string | undefined;
  if (parsed.destinationKind === 'cash') {
    const cashAccounts = activeAccounts.filter((account) => account.type === 'cash');
    if (cashAccounts.length === 1) destinationAccountId = cashAccounts[0].id;
  } else if (parsed.destinationKind === 'credit-card') {
    destinationAccountId = cardAccount(parsed.destinationHintLast4, 'credit');
  } else if (parsed.destinationKind === 'bank') {
    destinationAccountId = cardAccount(parsed.destinationHintLast4, 'debit');
    if (!destinationAccountId) {
      const running = activeAccounts.filter((account) => account.type === 'running');
      if (running.length === 1) destinationAccountId = running[0].id;
    }
    const cashAccounts = activeAccounts.filter((account) => account.type === 'cash');
    if (cashAccounts.length === 1) accountId = cashAccounts[0].id;
  }

  let conversionRequired = false;
  if (parsed.accountKind === 'credit-card' && accountId) {
    const account = accounts.find((candidate) => candidate.id === accountId);
    conversionRequired = !!account?.isActive && account.currency !== parsed.currency;
  }

  return { accountId, destinationAccountId, conversionRequired };
}
