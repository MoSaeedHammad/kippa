import type { PendingFinancialMessage } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';
import type { Suggestions } from './suggestions.js';

/**
 * Classification attributes a refine pass may rewrite on a staged message.
 * Deliberately excludes identity (id, household), pairing history
 * (destinationAmount/destinationCurrency of an already merged transfer) and
 * staging metadata (importBatchId, createdAt, status).
 */
export type RefinedPendingFields = Pick<
  PendingFinancialMessage,
  | 'kind' | 'provider' | 'amount' | 'currency' | 'date' | 'description' | 'counterparty'
  | 'accountHintLast4' | 'destinationHintLast4' | 'suggestedAccountId' | 'suggestedDestinationAccountId'
  | 'suggestedAccountProposal' | 'matchedTemplateId' | 'matchedTemplateName' | 'suggestedLoanId'
  | 'suggestedLoanName' | 'suggestedLoanInstallmentNumber' | 'suggestedCategoryId' | 'conversionRequired'
  | 'transferLeg' | 'mergeKey'
>;

const REFINED_KEYS: readonly (keyof RefinedPendingFields)[] = [
  'kind', 'provider', 'amount', 'currency', 'date', 'description', 'counterparty',
  'accountHintLast4', 'destinationHintLast4', 'suggestedAccountId', 'suggestedDestinationAccountId',
  'suggestedAccountProposal', 'matchedTemplateId', 'matchedTemplateName', 'suggestedLoanId',
  'suggestedLoanName', 'suggestedLoanInstallmentNumber', 'suggestedCategoryId', 'conversionRequired',
  'transferLeg', 'mergeKey',
];

/**
 * Re-derived attributes for one staged message under the current template
 * rules — the same derivation the import and the webhook perform, so a
 * refine pass converges staged docs with what a fresh forward would stage.
 */
export function refinedPendingFields(input: {
  parsed: ParsedFinancialMessage;
  suggestions: Suggestions;
  loanSuggestion: { loanId: string; loanName: string; installmentNumber: number } | null;
  suggestedCategoryId: string | null;
  matchedTemplateId?: string | null;
  matchedTemplateName?: string | null;
}): RefinedPendingFields {
  const { parsed, suggestions, loanSuggestion, suggestedCategoryId } = input;
  return {
    kind: parsed.kind,
    provider: parsed.provider,
    amount: parsed.amount,
    currency: parsed.currency,
    date: parsed.date,
    description: loanSuggestion ? `${loanSuggestion.loanName} — installment ${loanSuggestion.installmentNumber}` : parsed.description,
    counterparty: parsed.counterparty ?? null,
    accountHintLast4: parsed.accountHintLast4 ?? null,
    destinationHintLast4: parsed.destinationHintLast4 ?? null,
    suggestedAccountId: suggestions.accountId ?? null,
    suggestedDestinationAccountId: suggestions.destinationAccountId ?? null,
    suggestedAccountProposal: suggestions.accountProposal ?? null,
    matchedTemplateId: input.matchedTemplateId ?? null,
    matchedTemplateName: input.matchedTemplateName ?? null,
    suggestedLoanId: loanSuggestion?.loanId ?? null,
    suggestedLoanName: loanSuggestion?.loanName ?? null,
    suggestedLoanInstallmentNumber: loanSuggestion?.installmentNumber ?? null,
    suggestedCategoryId,
    conversionRequired: suggestions.conversionRequired || null,
    transferLeg: parsed.transferLeg ?? null,
    mergeKey: parsed.mergeKey ?? null,
  };
}

/** True when re-classification produced the exact stored attributes — no write needed. */
export function refineIsNoOp(existing: PendingFinancialMessage, fields: RefinedPendingFields): boolean {
  return REFINED_KEYS.every((key) => JSON.stringify(existing[key] ?? null) === JSON.stringify(fields[key] ?? null));
}
