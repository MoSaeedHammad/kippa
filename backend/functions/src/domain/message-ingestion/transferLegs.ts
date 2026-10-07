import type { Account, Card, PendingFinancialMessage } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';
import { pickSuggestions } from './suggestions.js';

/**
 * Pure builder for the doc update that merges the second arriving leg of a
 * two-message cross-currency transfer into the half-pending first leg.
 * Shared by the live webhook and the history import so both stage identical
 * merged transfers.
 */
export function buildMergedTransferLeg(input: {
  arriving: ParsedFinancialMessage;
  half: PendingFinancialMessage;
  /** Preview of the arriving message; prepended to the half's preview. */
  arrivingPreview: string;
  accounts: Account[];
  cards: Card[];
}): Partial<PendingFinancialMessage> {
  const { arriving, half, arrivingPreview } = input;
  const legFromHalf = {
    amount: half.amount,
    currency: half.currency,
    accountHintLast4: half.accountHintLast4 ?? undefined,
  };
  const debit = arriving.transferLeg === 'debit' ? arriving : legFromHalf;
  const credit = arriving.transferLeg === 'credit' ? arriving : legFromHalf;

  const suggestions = pickSuggestions(input.accounts, input.cards, {
    ...arriving,
    currency: debit.currency,
    accountHintLast4: debit.accountHintLast4,
    destinationHintLast4: credit.accountHintLast4,
    destinationKind: 'cash' as const,
  });
  const destinationAccount = input.accounts
    .filter((account) => account.isActive)
    .find((account) => account.currency === credit.currency && account.type === 'running');

  return {
    amount: debit.amount,
    currency: debit.currency,
    destinationAmount: credit.amount,
    destinationCurrency: credit.currency,
    accountHintLast4: debit.accountHintLast4 ?? null,
    destinationHintLast4: credit.accountHintLast4 ?? null,
    suggestedAccountId: suggestions.accountId ?? null,
    suggestedDestinationAccountId: destinationAccount?.id ?? null,
    transferLeg: null, // fully merged — no longer a half-pending
    mergeKey: null,
    messagePreview: `${arrivingPreview} · ${half.messagePreview}`,
  };
}
