import type { CurrencyCode, MessageTemplate } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';

export type TemplateValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type NormalizedMessageTemplate = {
  name: string;
  pattern: string;
  kind: MessageTemplate['kind'];
  amountGroup: string;
  currencyGroup: string | null;
  currency: CurrencyCode | null;
  dateGroup: string | null;
  dateFormat: NonNullable<MessageTemplate['dateFormat']> | null;
  merchantGroup: string | null;
  last4Group: string | null;
  cardKind: 'debit' | 'credit' | null;
  bankId: string | null;
  descriptionGroup: string | null;
  overrideBuiltIn: boolean;
  isActive: boolean;
};

export type TemplateMatch = {
  parsed: ParsedFinancialMessage;
  templateId: string;
  templateName: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: readonly MessageTemplate['kind'][] = ['expense', 'income', 'transfer'];
const CURRENCY = /^[A-Z]{3}$/;
const MAX_TEMPLATES_PER_HOUSEHOLD = 50;
const GROUP_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Compiles and sanity-checks a template definition; the regex must actually build. */
export function validateMessageTemplate(
  raw: Record<string, unknown>,
  existingGroups: { namedGroups: string[] } | null = null,
): TemplateValidationResult<NormalizedMessageTemplate> {
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
  if (!name) return { ok: false, error: 'A template name is required.' };
  const pattern = typeof raw.pattern === 'string' ? raw.pattern.trim() : '';
  if (!pattern || pattern.length > 2000) return { ok: false, error: 'A regex pattern (max 2000 chars) is required.' };
  const kind = raw.kind;
  if (typeof kind !== 'string' || !KINDS.includes(kind as MessageTemplate['kind'])) {
    return { ok: false, error: 'kind must be expense, income or transfer.' };
  }
  try {
    // Reject global/sticky (stateful) regexes; matching is always case-insensitive.
    new RegExp(pattern, 'i');
  } catch {
    return { ok: false, error: 'The pattern is not a valid regular expression.' };
  }

  const groupName = (value: unknown): string | null => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text && GROUP_NAME.test(text) ? text : null;
  };
  const amountGroup = groupName(raw.amountGroup) ?? 'amount';
  const currencyGroup = groupName(raw.currencyGroup);
  const currencyRaw = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
  const currency = CURRENCY.test(currencyRaw) ? currencyRaw as CurrencyCode : null;
  if (!currencyGroup && !currency) {
    return { ok: false, error: 'Provide a currency group or a fallback currency.' };
  }
  const dateGroup = groupName(raw.dateGroup);
  const dateFormatRaw = typeof raw.dateFormat === 'string' ? raw.dateFormat : '';
  const dateFormat = (['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd'] as const)
    .find((format) => format === dateFormatRaw) ?? null;
  if (dateGroup && !dateFormat) {
    return { ok: false, error: 'Pick a date format for the date group.' };
  }
  const merchantGroup = groupName(raw.merchantGroup);
  const last4Group = groupName(raw.last4Group);
  const cardKindRaw = typeof raw.cardKind === 'string' ? raw.cardKind : '';
  const cardKind = cardKindRaw === 'debit' || cardKindRaw === 'credit' ? cardKindRaw : null;
  const bankId = typeof raw.bankId === 'string' && raw.bankId.trim() ? raw.bankId.trim() : null;
  const descriptionGroup = groupName(raw.descriptionGroup);
  const overrideBuiltIn = raw.overrideBuiltIn === true;
  const isActive = raw.isActive === false ? false : true;

  if (existingGroups && existingGroups.namedGroups.length > 0) {
    const missing = [amountGroup, currencyGroup, dateGroup, merchantGroup, last4Group, descriptionGroup]
      .filter((group, index) => {
        const required = index === 0 || (group !== null && group !== amountGroup);
        return required && group && !existingGroups.namedGroups.includes(group);
      });
    if (missing.length > 0) {
      return { ok: false, error: `The pattern is missing the named group(s): ${missing.join(', ')}.` };
    }
  }

  return {
    ok: true,
    value: {
      name, pattern, kind: kind as MessageTemplate['kind'], amountGroup, currencyGroup, currency,
      dateGroup, dateFormat, merchantGroup, last4Group, cardKind, bankId, descriptionGroup,
      overrideBuiltIn, isActive,
    },
  };
}

function parseTemplateDate(text: string, format: NonNullable<MessageTemplate['dateFormat']>): string | null {
  const tokens = format.split(/[-/]/);
  const values = text.split(/[-/]/).map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value)) || tokens.length !== 3 || values.length !== 3) return null;
  const day = values[tokens.indexOf('dd')];
  const month = values[tokens.indexOf('MM')];
  const year = values[tokens.indexOf('yyyy')];
  if (!day || !month || !year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Runs one message through one template. Returns null when the pattern does
 * not match or the extracted amount is not a positive number.
 */
export function applyMessageTemplate(
  messageText: string,
  template: Pick<MessageTemplate, 'id' | 'name' | 'pattern' | 'kind' | 'amountGroup' | 'currencyGroup' | 'currency' | 'dateGroup' | 'dateFormat' | 'merchantGroup' | 'last4Group' | 'cardKind' | 'bankId' | 'descriptionGroup'>,
  todayIso: string,
): TemplateMatch | null {
  let regex: RegExp;
  try {
    regex = new RegExp(template.pattern, 'i');
  } catch {
    return null;
  }
  const match = regex.exec(messageText);
  if (!match) return null;

  const group = (name: string | null | undefined): string | undefined =>
    name && match.groups ? match.groups[name]?.trim() : undefined;

  const amountText = group(template.amountGroup)?.replace(/[,\s]/g, '');
  const amount = amountText ? Number(amountText) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const currency = (group(template.currencyGroup) ?? template.currency ?? 'EGP').toUpperCase();
  const date = template.dateGroup && template.dateFormat
    ? parseTemplateDate(group(template.dateGroup) ?? '', template.dateFormat) ?? todayIso
    : todayIso;
  const merchant = group(template.merchantGroup) ?? null;
  const last4raw = group(template.last4Group)?.replace(/\D/g, '');
  const accountHintLast4 = last4raw ? last4raw.slice(-4) : undefined;
  const description = (group(template.descriptionGroup) || merchant || template.name).slice(0, 120);

  return {
    templateId: template.id,
    templateName: template.name,
    parsed: {
      kind: template.kind,
      provider: template.bankId ?? 'custom',
      amount,
      currency,
      date,
      description,
      counterparty: merchant ?? undefined,
      accountHintLast4,
      accountKind: accountHintLast4 && template.cardKind === 'credit' ? 'credit-card' : 'bank',
    },
  };
}

/** First active template that matches the message. */
export function matchMessageTemplates(
  messageText: string,
  templates: MessageTemplate[],
  todayIso: string,
): TemplateMatch | null {
  for (const template of templates) {
    if (!template.isActive) continue;
    const match = applyMessageTemplate(messageText, template, todayIso);
    if (match) return match;
  }
  return null;
}

export const MESSAGE_TEMPLATE_LIMITS = { maxPerHousehold: MAX_TEMPLATES_PER_HOUSEHOLD };
export { ISO_DATE as MESSAGE_TEMPLATE_ISO_DATE };
