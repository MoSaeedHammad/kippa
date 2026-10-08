import type { Account, Card } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';

export type AccountProposal = {
  /** Frontend bank preset id (e.g. 'banque-misr') derived from the message provider. */
  bankId: string;
  cardKind: 'debit' | 'credit';
  last4: string;
};

export type Suggestions = {
  accountId?: string;
  destinationAccountId?: string;
  conversionRequired: boolean;
  /** Set when the message names a card that does not exist yet — propose creating it. */
  accountProposal?: AccountProposal;
};

/** Backend message `provider` labels → frontend bank preset ids (banks.tsx). */
export const PROVIDER_BANK_IDS: Record<string, string> = {
  'hsbc': 'hsbc',
  'bank-misr': 'banque-misr',
  'banque-misr': 'banque-misr',
  'cib': 'cib',
  'nbe': 'nbe',
  'qnb': 'qnb',
};

export function providerToBankId(provider: string | undefined): string {
  if (!provider) return 'other';
  return PROVIDER_BANK_IDS[provider.toLowerCase()] ?? 'other';
}

/**
 * Pure account/card suggestion logic for a parsed bank message. Firestore-free
 * so it can be unit tested; the ingestion function loads docs and delegates here.
 */
export function pickSuggestions(accounts: Account[], cards: Card[], parsed: ParsedFinancialMessage): Suggestions {
  const activeAccounts = accounts.filter((account) => account.isActive && account.currency === parsed.currency);
  const providerBankId = providerToBankId(parsed.provider);
  const cardAccount = (hint: string | undefined, kind?: 'credit' | 'debit') => {
    if (!hint) return undefined;
    const candidates = cards.filter((candidate) => candidate.isActive
      && (!kind || candidate.kind === kind)
      && candidate.last4 === hint);
    // Prefer a card issued by the same bank as the message, but any last4
    // match wins over no match at all.
    const sameBank = candidates.find((candidate) => candidate.bankId === providerBankId);
    return (sameBank ?? candidates[0])?.parentAccountId;
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

  // A message in a currency the target account doesn't hold (a USD charge on
  // an EGP account or card) needs the settled amount at approval, whatever
  // the account type — not only credit cards.
  let conversionRequired = false;
  const resolutionTarget = accountId ?? destinationAccountId;
  if (resolutionTarget) {
    const account = accounts.find((candidate) => candidate.id === resolutionTarget);
    conversionRequired = !!account?.isActive && account.currency !== parsed.currency;
  }

  // Propose creating the card when the message clearly names one (last4 + kind)
  // and no existing card carries those digits — even when an account fallback
  // already resolved, so the household can attach the card for future messages.
  let accountProposal: AccountProposal | undefined;
  const proposedKind = parsed.accountKind === 'credit-card' ? 'credit' : 'debit';
  const hintMatched = parsed.accountHintLast4
    ? !!cardAccount(parsed.accountHintLast4, proposedKind)
    : true;
  if (parsed.accountHintLast4 && !hintMatched) {
    accountProposal = { bankId: providerBankId, cardKind: proposedKind, last4: parsed.accountHintLast4 };
  }

  return { accountId, destinationAccountId, conversionRequired, accountProposal };
}
