export type ParsedFinancialMessage = {
  kind: 'expense' | 'income' | 'transfer';
  provider: string;
  amount: number;
  currency: string;
  date: string;
  description: string;
  counterparty?: string;
  accountHintLast4?: string;
  destinationHintLast4?: string;
  /** Bank reference number (e.g. HSBC IPN `with reference e33925a9`) kept for statement matching. */
  reference?: string;
  accountKind: 'bank' | 'credit-card';
  destinationKind?: 'cash' | 'credit-card' | 'bank';
  /** Marks one leg of a multi-message cross-currency transfer so the ingestion layer can merge them. */
  transferLeg?: 'debit' | 'credit';
  /** Shared key used to correlate matching transfer legs. */
  mergeKey?: string;
};

export type ParseResult =
  | { outcome: 'matched'; parsed: ParsedFinancialMessage }
  | { outcome: 'notification'; title: string; message: string; deepLink: string }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'unsupported'; reason: string };

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function amount(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function compactDate(value: string): string {
  const match = value.toUpperCase().match(/^(\d{2})-?([A-Z]{3})-?(\d{2})(\d{2})?$/);
  if (!match || !MONTHS[match[2]]) return new Date().toISOString().slice(0, 10);
  const year = match[4] ? match[3] + match[4] : `20${match[3]}`;
  return `${year}-${MONTHS[match[2]]}-${match[1]}`;
}

function numericDate(value: string): string {
  const match = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : new Date().toISOString().slice(0, 10);
}

/** dd/MM/yyyy or dd-MON-yyyy (Bank Misr mixes both across message variants). */
function misrDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/[A-Za-z]{3}/.test(value)) return compactDate(value);
  return numericDate(value);
}

function dayMonthDate(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${new Date().getUTCFullYear()}-${match[2]}-${match[1]}`;
}

function last4(value?: string): string | undefined {
  return value?.replace(/\D/g, '').slice(-4) || undefined;
}

/**
 * Normalizes a captured currency token: currency symbols map to their ISO
 * code and anything else uppercases. Unknown bare words (e.g. a stray
 * two-letter fragment) are rejected so the caller can fall back.
 */
export function normalizeCurrencyToken(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const token = raw.trim();
  if (!token) return undefined;
  if (token === '$') return 'USD';
  if (token === '€') return 'EUR';
  if (token === '£') return 'GBP';
  const upper = token.toUpperCase();
  return /^[A-Z]{3}$/.test(upper) ? upper : undefined;
}

/** Any ISO-4217 code or a common symbol, before or after the amount. */
const CURRENCY_TOKEN = '(\\$|€|£|[A-Z]{3})';
const AMOUNT_TOKEN = '([\\d,]+(?:\\.\\d{1,2})?)';

/** Credit-card mentions that force `accountKind: 'credit-card'` regardless of phrasing. */
const CREDIT_CARD_KEYWORDS = /credit\s*card|بطاقة\s*(?:بنك\s*مصر\s*)?(?:ال)?ائتمانية|(?:ال)?ائتمانية/i;

/**
 * Statements, login alerts and other non-financial noise. Exported so the
 * ingestion layer can apply it before giving user templates precedence —
 * user rules must never turn noise into transactions.
 */
export function isIgnoredFinancialMessage(text: string): boolean {
  if (/statement date|minimum amount due|min\.?\s*amt due|total amt due|statement is issued with total|statement password|keep it private/i.test(text)) return true;
  if (/تم تسجيل الدخول/.test(text)) return true;
  // Security alerts, PIN/OTP verifications, declines and other no-money-moved
  // messages — the real purchase arrives in its own SMS.
  if (/Transfer to third party account is done|biller or payment information is added/i.test(text)) return true;
  if (/use PIN \d+ to (?:pay|complete)|complete the registration of your account/i.test(text)) return true;
  if (/was declined|due to invalid PIN|was\s+not successful|Happy Birthday|has been authenticated to access/i.test(text)) return true;
  if (/IPN PIN/i.test(text)) return true;
  if (/تم رفض (?:العملية|المعاملة)|تم الغاء ايداع/.test(text)) return true;
  if (/الافصاح عن الكود OTP|Deposit OTP/.test(text)) return true;
  // Bank Misr service noise: branch surveys, request tracking, promos.
  if (/شكرا لزيارتك فرع|تسجيل طلبكم|يرجي مراجعة البنك|طلب الحصول علي القرض/.test(text)) return true;
  // Returned cheques move no money; the rest are onboarding/service messages.
  if (/cheque no\.?\s*\d+ for .+ was returned|secure key activation code|HSBC Expat application|has been updated\.? If you have not initiated/i.test(text)) return true;
  return false;
}

function cleanParty(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
}

/**
 * Removes balances, references and exact account numbers from the copy shown
 * in the review UI. The complete message is parsed in memory but is never
 * persisted.
 */
export function buildMessagePreview(raw: string): string {
  return raw
    .replace(/\b\d{3}-\d{3}\*{2,}-\d{3}\b/g, '••• account')
    .replace(/\*+\d{3,4}/g, '••••')
    .replace(/(?:Your available (?:balance|limit) is|with reference)\s+[^.]+\.?/gi, '')
    // Bank Misr balance runs (available balance / current balance / international
    // usage limit), in glued and spaced forms, each through their amount. The
    // currency is Latin letters and may sit before or after the amount.
    .replace(/و?\s*(?:ال)?(?:رصيدكم\s*الحالي|رصيد\s*المتاح|حد\s*الاستخدام\s*الدولي\s*المتاح)\s*(?:[A-Z]{3}\s*)?[\d,]+(?:\.\d{1,2})?(?:\s*[A-Z]{3})?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

export function parseFinancialMessage(raw: string, source = 'sms', senderHint = ''): ParseResult {
  const text = raw.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  if (!text) return { outcome: 'unsupported', reason: 'Message is empty.' };

  if (isIgnoredFinancialMessage(text)) {
    return { outcome: 'ignored', reason: 'Statement alerts and login notifications do not create transactions.' };
  }

  const provider = /HSBC/i.test(text) || /hsbc/i.test(senderHint)
    ? 'hsbc'
    : /misr/i.test(senderHint) ? 'bank-misr' : source.toLowerCase();

  const debitPurchase = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+(.+?)\s+Purchase from\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)-/i,
  );
  if (debitPurchase) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, date: compactDate(debitPurchase[1]),
        description: cleanParty(debitPurchase[2]), counterparty: cleanParty(debitPurchase[2]),
        accountHintLast4: last4(debitPurchase[3]), accountKind: 'bank',
        currency: debitPurchase[4].toUpperCase(), amount: amount(debitPurchase[5]),
      },
    };
  }

  const atmWithdrawal = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+ATM Cash Withdrawal from\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)-/i,
  );
  if (atmWithdrawal) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider, date: compactDate(atmWithdrawal[1]),
        description: 'ATM cash withdrawal', counterparty: 'Cash',
        accountHintLast4: last4(atmWithdrawal[2]), accountKind: 'bank', destinationKind: 'cash',
        currency: atmWithdrawal[3].toUpperCase(), amount: amount(atmWithdrawal[4]),
      },
    };
  }

  // Phone Banking Transfer — debit leg ("from", amount ends with -)
  const phoneTransferDebit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Phone Banking Transfer from\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)-/i,
  );
  if (phoneTransferDebit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider, date: compactDate(phoneTransferDebit[1]),
        description: 'Phone Banking Transfer',
        accountHintLast4: last4(phoneTransferDebit[2]), accountKind: 'bank',
        currency: phoneTransferDebit[3].toUpperCase(), amount: amount(phoneTransferDebit[4]),
        transferLeg: 'debit', mergeKey: 'phone-banking-transfer',
      },
    };
  }

  // Phone Banking Transfer — credit leg ("to", amount ends with +)
  const phoneTransferCredit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Phone Banking Transfer to\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\+/i,
  );
  if (phoneTransferCredit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider, date: compactDate(phoneTransferCredit[1]),
        description: 'Phone Banking Transfer',
        accountHintLast4: last4(phoneTransferCredit[2]), accountKind: 'bank',
        currency: phoneTransferCredit[3].toUpperCase(), amount: amount(phoneTransferCredit[4]),
        transferLeg: 'credit', mergeKey: 'phone-banking-transfer',
      },
    };
  }

  // Card payments — money moving to your own credit card, not spending.
  // These run BEFORE the plain "Transfer from" rule, whose prefix they share.
  const transferToCard = text.match(
    /From HSBC:\s*\d{2}[A-Z]{3}\d{2}\s+Transfer from\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)-\s+to your Credit Card ending (?:with\s*)?(\d{4})/i,
  );
  const thankYouCardPayment = text.match(
    /Thank you for the payment of\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+for Credit Card ending (?:with\s*)?\*{3}\s*(\d{4})/i,
  );
  if (transferToCard || thankYouCardPayment) {
    const value = transferToCard ? transferToCard[3] : thankYouCardPayment![2];
    const currencyToken = transferToCard ? transferToCard[2] : thankYouCardPayment![1];
    const cardLast4 = transferToCard ? transferToCard[4] : thankYouCardPayment![3];
    return {
      outcome: 'notification',
      title: 'Credit-card payment detected',
      message: `${amount(value)} ${currencyToken.toUpperCase()} paid to card •${cardLast4}. Match it to the charges you paid.`,
      deepLink: '/accounts',
    };
  }

  // Some recurring HSBC debits (including loan installments) omit the
  // "Phone Banking" prefix. The trailing minus is the authoritative debit
  // signal; ingestion can then safely match it to a known commitment.
  const bankTransferDebit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Transfer from\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)-/i,
  );
  if (bankTransferDebit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, date: compactDate(bankTransferDebit[1]),
        description: 'Bank transfer debit',
        accountHintLast4: last4(bankTransferDebit[2]), accountKind: 'bank',
        currency: bankTransferDebit[3].toUpperCase(), amount: amount(bankTransferDebit[4]),
      },
    };
  }

  // Reversals put money back after a failed movement — plain income.
  const ipnReversal = text.match(
    /(?:HSBC Account\s*)?\*+(\d{4})\s+was reversed with IPN outward transfer for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+from\s+(.+?)\s+with reference\s+([A-Za-z0-9-]+)/i,
  );
  if (ipnReversal) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider, accountKind: 'bank', accountHintLast4: ipnReversal[1],
        currency: ipnReversal[2].toUpperCase(), amount: amount(ipnReversal[3]),
        date: numericDate(ipnReversal[4]), counterparty: cleanParty(ipnReversal[5]),
        description: `Reversal of transfer to ${cleanParty(ipnReversal[5])} (ref ${ipnReversal[6]})`,
        reference: ipnReversal[6],
      },
    };
  }

  const atmReversal = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+ATM Reversal of Cash Withdrawal from\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\+/i,
  );
  if (atmReversal) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider, date: compactDate(atmReversal[1]),
        description: 'ATM withdrawal reversal', counterparty: 'ATM',
        accountHintLast4: last4(atmReversal[2]), accountKind: 'bank',
        currency: atmReversal[3].toUpperCase(), amount: amount(atmReversal[4]),
      },
    };
  }

  const cashDeposit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Cash Deposit to\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\+/i,
  );
  if (cashDeposit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider, date: compactDate(cashDeposit[1]),
        description: 'Cash deposit at branch', destinationKind: 'bank',
        destinationHintLast4: last4(cashDeposit[2]), accountHintLast4: undefined,
        accountKind: 'bank',
        currency: cashDeposit[3].toUpperCase(), amount: amount(cashDeposit[4]),
      },
    };
  }

  const chequeCredit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Cheque to\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\+/i,
  );
  if (chequeCredit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider, date: compactDate(chequeCredit[1]),
        description: 'Cheque deposit', counterparty: 'Cheque',
        accountHintLast4: last4(chequeCredit[2]), accountKind: 'bank',
        currency: chequeCredit[3].toUpperCase(), amount: amount(chequeCredit[4]),
      },
    };
  }

  // Internet Banking / TT payments — no counterparty is named, so the app's
  // bank-message convention applies: money in = income, money out = expense.
  const internetBanking = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+(Internet Banking )?(TT Payment|Transfer) (to|from)\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)[+-]/i,
  );
  if (internetBanking) {
    const [, date, , channel, direction, account, currencyToken, value] = internetBanking;
    const incoming = direction === 'to';
    const label = channel === 'TT Payment' ? (incoming ? 'TT payment in' : 'TT payment out') : incoming ? 'Internet banking transfer in' : 'Internet banking transfer out';
    return {
      outcome: 'matched',
      parsed: {
        kind: incoming ? 'income' : 'expense', provider, date: compactDate(date),
        description: label,
        accountHintLast4: last4(account), accountKind: 'bank',
        currency: currencyToken.toUpperCase(), amount: amount(value),
      },
    };
  }

  const salaryCredit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Salary to\s+([^\s]+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\+/i,
  );
  if (salaryCredit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider, date: compactDate(salaryCredit[1]),
        description: 'Salary', counterparty: 'Employer',
        accountHintLast4: last4(salaryCredit[2]), accountKind: 'bank',
        currency: salaryCredit[3].toUpperCase(), amount: amount(salaryCredit[4]),
      },
    };
  }

  const chequeDebit = text.match(
    /From HSBC:\s*(\d{2}[A-Z]{3}\d{2})\s+Cheque from\s+([^\s]+)\s+with cheque no #(\d+)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)-/i,
  );
  if (chequeDebit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, date: compactDate(chequeDebit[1]),
        description: `Cheque #${chequeDebit[3]}`, counterparty: 'Cheque',
        accountHintLast4: last4(chequeDebit[2]), accountKind: 'bank',
        currency: chequeDebit[4].toUpperCase(), amount: amount(chequeDebit[5]),
        reference: chequeDebit[3],
      },
    };
  }

  const creditPurchase = text.match(
    /(?:Your|HSBC) Credit Card ending (?:with\s*)?\*{3}\s*(\d{4}).*?used for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}\/\d{2}\/\d{4})\s+at\s+(.+?)(?:\.\s*Your available limit|$)/i,
  );
  if (creditPurchase) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, accountKind: 'credit-card', accountHintLast4: creditPurchase[1],
        currency: creditPurchase[2].toUpperCase(), amount: amount(creditPurchase[3]),
        date: numericDate(creditPurchase[4]), description: cleanParty(creditPurchase[5]),
        counterparty: cleanParty(creditPurchase[5]),
      },
    };
  }

  const ipnInward = text.match(
    /(?:HSBC Account\s*)?\*+(\d{4})\s+was credited with IPN inward transfer for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+from\s+(.+?)\s+with reference\s+([A-Za-z0-9-]+)/i,
  );
  if (ipnInward) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider, accountKind: 'bank', accountHintLast4: ipnInward[1],
        currency: ipnInward[2].toUpperCase(), amount: amount(ipnInward[3]),
        date: numericDate(ipnInward[4]), counterparty: cleanParty(ipnInward[5]),
        description: `Transfer from ${cleanParty(ipnInward[5])} (ref ${ipnInward[6]})`,
        reference: ipnInward[6],
      },
    };
  }

  const ipnPurchase = text.match(
    /(?:Your\s+)?HSBC Account\s*\*+(\d{4})\s+was debited with IPN purchase for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+from\s+(.+?)\s+with reference\s+([A-Za-z0-9-]+)/i,
  );
  if (ipnPurchase) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, accountKind: 'bank', accountHintLast4: ipnPurchase[1],
        currency: ipnPurchase[2].toUpperCase(), amount: amount(ipnPurchase[3]),
        date: numericDate(ipnPurchase[4]), counterparty: cleanParty(ipnPurchase[5]),
        description: `Purchase from ${cleanParty(ipnPurchase[5])} (ref ${ipnPurchase[6]})`,
        reference: ipnPurchase[6],
      },
    };
  }

  const ipnOutward = text.match(
    /(?:Your\s+)?HSBC Account\s*\*+(\d{4})\s+was debited with IPN outward transfer for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+to\s+(.+?)\s+with reference\s+([A-Za-z0-9-]+)/i,
  );
  if (ipnOutward) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, accountKind: 'bank', accountHintLast4: ipnOutward[1],
        currency: ipnOutward[2].toUpperCase(), amount: amount(ipnOutward[3]),
        date: numericDate(ipnOutward[4]), counterparty: cleanParty(ipnOutward[5]),
        description: `Transfer to ${cleanParty(ipnOutward[5])} (ref ${ipnOutward[6]})`,
        reference: ipnOutward[6],
      },
    };
  }

  const cardPayment = text.match(
    /Credit Card ending (?:with\s*)?\*{3}\s*(\d{4}).*?(?:credited with|payment (?:of )?(?:was )?received)\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)/i,
  );
  if (cardPayment) {
    return {
      outcome: 'notification',
      title: 'Credit-card payment detected',
      message: `${amount(cardPayment[3])} ${cardPayment[2].toUpperCase()} reached card •${cardPayment[1]}. Match it to the charges you paid.`,
      deepLink: '/accounts',
    };
  }

  // ── Bank Misr ────────────────────────────────────────────────────────
  // Account-wording variants: حساب رقم / حسابي رقم / الحساب رقم, with an
  // optional x*/** mask before the (possibly longer-than-4) account number.
  const MISR_ACCOUNT = '(?:ال)?حساب(?:ي|ى)?\\s*رقم\\s*[x*]*(\\d{4,})';

  const misrTransferIn = text.match(
    new RegExp(`تم اضافة مبلغ\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}\\s*الى ${MISR_ACCOUNT}\\s*فى\\s*(\\d{2}-[A-Z]{3}-\\d{4})\\s*عن طريق التحويل اللحظي`, 'i'),
  );
  if (misrTransferIn) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider: 'bank-misr', accountKind: 'bank',
        date: compactDate(misrTransferIn[4]), description: 'Instant transfer in',
        accountHintLast4: last4(misrTransferIn[3]),
        currency: normalizeCurrencyToken(misrTransferIn[2]) ?? 'EGP', amount: amount(misrTransferIn[1]),
      },
    };
  }

  const misrTransferOut = text.match(
    new RegExp(`تم تحويل مبلغ\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}\\s*من ${MISR_ACCOUNT}\\s*فى\\s*(\\d{2}-[A-Z]{3}-\\d{4})\\s*عن طريق التحويل اللحظي`, 'i'),
  );
  if (misrTransferOut) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider: 'bank-misr', accountKind: 'bank',
        date: compactDate(misrTransferOut[4]), description: 'Instant transfer out',
        accountHintLast4: last4(misrTransferOut[3]),
        currency: normalizeCurrencyToken(misrTransferOut[2]) ?? 'EGP', amount: amount(misrTransferOut[1]),
      },
    };
  }

  // Credit-card purchase. Two spellings of the same message exist in the
  // wild, so the card phrase is matched flexibly: بطاقة بنك مصر الائتمانية,
  // بطاقة ائتمانية, البطاقة الائتمانية … with optional المنتهية بـ mask.
  const misrCardCharge = text.match(
    new RegExp(
      `بطاقة\\s*(?:بنك\\s*مصر)?\\s*(?:ال)?ائتمانية\\s*(?:(?:المنتهية\\s*)?ب?ـ?\\s*\\*{0,4}\\s*)?(\\d{4})\\s*[،,]?\\s*تم\\s*خصم\\s*(?:مبلغ\\s*)?${CURRENCY_TOKEN}?\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}?\\s*(?:في|فى)\\s*(.+?)\\s*(?:[A-Z]{2}|>)?\\s*بتاريخ\\s*(\\d{2}\\/\\d{2}\\/\\d{4})`,
      'i',
    ),
  );
  if (misrCardCharge) {
    const currency = normalizeCurrencyToken(misrCardCharge[2] ?? misrCardCharge[4]) ?? 'EGP';
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider: 'bank-misr', accountKind: 'credit-card',
        accountHintLast4: last4(misrCardCharge[1]), currency, amount: amount(misrCardCharge[3]),
        date: numericDate(misrCardCharge[6]),
        description: cleanParty(misrCardCharge[5]), counterparty: cleanParty(misrCardCharge[5]),
      },
    };
  }

  const misrCardPayment = text.match(
    new RegExp(`تم إيداع\\s*${CURRENCY_TOKEN}?\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}?\\s*بالبطاقة الائتمانية المنتهية\\s*بـ?\\s*\\*+\\s*(\\d{4})`, 'i'),
  );
  if (misrCardPayment) {
    const currency = normalizeCurrencyToken(misrCardPayment[1] ?? misrCardPayment[3]) ?? 'EGP';
    return {
      outcome: 'notification',
      title: 'Credit-card payment detected',
      message: `${amount(misrCardPayment[2])} ${currency} reached card •${misrCardPayment[4]}. Match it to the charges you paid.`,
      deepLink: '/accounts',
    };
  }

  const misrMachineDebit = text.match(
    new RegExp(`بطاقة بنك مصر\\s*\\*+\\s*(\\d{4})\\s*[،,]?\\s*تم الخصم مبلغ\\s*${CURRENCY_TOKEN}?\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}?\\s*الة رقم\\s*\\d+.*?يوم\\s*(\\d{2}\\/\\d{2})`, 'i'),
  );
  if (misrMachineDebit) {
    const currency = normalizeCurrencyToken(misrMachineDebit[2] ?? misrMachineDebit[4]) ?? 'EGP';
    return {
      outcome: 'matched',
      parsed: refineCardKind(text, {
        kind: 'transfer', provider: 'bank-misr', accountKind: 'bank',
        accountHintLast4: misrMachineDebit[1],
        currency, amount: amount(misrMachineDebit[3]),
        date: dayMonthDate(misrMachineDebit[5]),
        description: 'ATM cash withdrawal', destinationKind: 'cash',
      }),
    };
  }

  const misrMachineCredit = text.match(
    new RegExp(`بطاقة بنك مصر\\s*\\*+\\s*(\\d{4})\\s*[،,]?\\s*تم إضافة مبلغ\\s*${CURRENCY_TOKEN}?\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}?\\s*الة رقم\\s*\\d+.*?يوم\\s*(\\d{2}\\/\\d{2})`, 'i'),
  );
  if (misrMachineCredit) {
    const currency = normalizeCurrencyToken(misrMachineCredit[2] ?? misrMachineCredit[4]) ?? 'EGP';
    return {
      outcome: 'matched',
      parsed: refineCardKind(text, {
        kind: 'transfer', provider: 'bank-misr', accountKind: 'bank',
        // Cash deposits credit the bank account tied to the card; there is no
        // source bank account, so the hint is explicitly absent.
        destinationHintLast4: misrMachineCredit[1],
        accountHintLast4: undefined,
        currency, amount: amount(misrMachineCredit[3]),
        date: dayMonthDate(misrMachineCredit[5]),
        description: 'Cash deposit at machine', destinationKind: 'bank',
      }),
    };
  }

  // Instant transfer into a card, naming the sender and reference number —
  // the richer variant of the plain "تم اضافة مبلغ" message.
  const misrInstantInRef = text.match(
    new RegExp(`تم إضافة تحويل لحظي الي بطاقة رقم\\s*([\\dx*]+)\\s*بمبلغ\\s*${AMOUNT_TOKEN}\\s*(?:جم|${CURRENCY_TOKEN})?\\s*من\\s*(.+?)\\s*رقم مرجعي\\s*(\\d+)\\s*يوم\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i'),
  );
  if (misrInstantInRef) {
    return {
      outcome: 'matched',
      parsed: refineCardKind(text, {
        kind: 'income', provider: 'bank-misr', accountKind: 'bank',
        accountHintLast4: last4(misrInstantInRef[1]),
        currency: normalizeCurrencyToken(misrInstantInRef[3]) ?? 'EGP', amount: amount(misrInstantInRef[2]),
        date: misrDate(misrInstantInRef[6]),
        counterparty: cleanParty(misrInstantInRef[4]),
        description: `Instant transfer from ${cleanParty(misrInstantInRef[4])} (ref ${misrInstantInRef[5]})`,
        reference: misrInstantInRef[5],
      }),
    };
  }

  // Instant transfer out naming the beneficiary and reference number.
  const misrInstantOutRef = text.match(
    new RegExp(`تم تنفيذ تحويل لحظي من حسابكم رقم\\s*([\\dx*]+)\\s*بمبلغ\\s*${AMOUNT_TOKEN}\\s*(?:جم|${CURRENCY_TOKEN})?\\s*[إا]لى\\s*(.+?)\\s*رقم مرجعي\\s*(\\d+)\\s*يوم\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i'),
  );
  if (misrInstantOutRef) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider: 'bank-misr', accountKind: 'bank',
        accountHintLast4: last4(misrInstantOutRef[1]),
        currency: normalizeCurrencyToken(misrInstantOutRef[3]) ?? 'EGP', amount: amount(misrInstantOutRef[2]),
        date: misrDate(misrInstantOutRef[6]),
        counterparty: cleanParty(misrInstantOutRef[4]),
        description: `Instant transfer to ${cleanParty(misrInstantOutRef[4])} (ref ${misrInstantOutRef[5]})`,
        reference: misrInstantOutRef[5],
      },
    };
  }

  // Branch cash deposit: "تم ايداع مبلغ 5000EGP فى حساب رقم xxx7391 فى 15/06/2026".
  const misrBranchDeposit = text.match(
    new RegExp(`تم [إا]?يداع مبلغ\\s*${AMOUNT_TOKEN}\\s*(?:جم|${CURRENCY_TOKEN})?\\s*فى (?:حساب|البطاقة)(?:ي|ى)?\\s*رقم\\s*[x*]*([\\dx*]+)\\s*فى\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i'),
  );
  if (misrBranchDeposit) {
    return {
      outcome: 'matched',
      parsed: refineCardKind(text, {
        kind: 'transfer', provider: 'bank-misr', accountKind: 'bank',
        accountHintLast4: undefined, destinationHintLast4: last4(misrBranchDeposit[3]),
        currency: normalizeCurrencyToken(misrBranchDeposit[2]) ?? 'EGP', amount: amount(misrBranchDeposit[1]),
        date: misrDate(misrBranchDeposit[4]),
        description: 'Cash deposit at branch', destinationKind: 'bank',
      }),
    };
  }

  // Branch cash withdrawal: "تم سحب مبلغ 200USD نقداً من حساب رقم xxx7391 فى 12/06/2026".
  const misrBranchWithdrawal = text.match(
    new RegExp(`تم سحب مبلغ\\s*${AMOUNT_TOKEN}\\s*(?:جم|${CURRENCY_TOKEN})?\\s*نقدا?[ً]?\\s*من حساب(?:ي|ى)?\\s*رقم\\s*[x*]*([\\dx*]+)\\s*فى\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i'),
  );
  if (misrBranchWithdrawal) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider: 'bank-misr', accountKind: 'bank',
        accountHintLast4: last4(misrBranchWithdrawal[3]),
        currency: normalizeCurrencyToken(misrBranchWithdrawal[2]) ?? 'EGP', amount: amount(misrBranchWithdrawal[1]),
        date: misrDate(misrBranchWithdrawal[4]),
        description: 'Cash withdrawal at branch', destinationKind: 'cash',
      },
    };
  }

  // Refund of a card purchase: "تم رد المعاملة بقيمة 1229EGP للبطاقة *****2508، بتاريخ 12/11/2025 من Uber ،".
  const misrRefund = text.match(
    new RegExp(`تم رد المعاملة بقيمة\\s*${AMOUNT_TOKEN}\\s*(?:جم|${CURRENCY_TOKEN})?\\s*للبطاقة\\s*[x*]*([\\dx*]+)\\s*[،,]?\\s*بتاريخ\\s*(\\d{2}/\\d{2}/\\d{4})\\s*من\\s*(.+?)[،,]`, 'i'),
  );
  if (misrRefund) {
    return {
      outcome: 'matched',
      parsed: refineCardKind(text, {
        kind: 'income', provider: 'bank-misr', accountKind: 'credit-card',
        accountHintLast4: last4(misrRefund[3]),
        currency: normalizeCurrencyToken(misrRefund[2]) ?? 'EGP', amount: amount(misrRefund[1]),
        date: numericDate(misrRefund[4]),
        counterparty: cleanParty(misrRefund[5]),
        description: `Refund from ${cleanParty(misrRefund[5])}`,
      }),
    };
  }

  // Terminal credit: "Dear Customer, your account 1000026… is credited by 5000 on 20/06/2026 … terminal …".
  const misrTerminalCredit = text.match(
    new RegExp(`your account\\s*[\\dx*]+\\s*is credited by\\s*${AMOUNT_TOKEN}\\s*on\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i'),
  );
  if (misrTerminalCredit) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider: 'bank-misr', accountKind: 'bank',
        currency: 'EGP', amount: amount(misrTerminalCredit[1]),
        date: misrTerminalCredit[3]
          ? `${misrTerminalCredit[3]}-${misrTerminalCredit[2].slice(3, 5)}-${misrTerminalCredit[2].slice(0, 2)}`
          : dayMonthDate(misrTerminalCredit[2]),
        description: 'Cash deposit at terminal', destinationKind: 'bank',
      },
    };
  }

  const keyword = parseByKeywords(text, provider);
  if (keyword) return { outcome: 'matched', parsed: keyword };

  return { outcome: 'unsupported', reason: 'No supported financial transaction was found.' };
}

/**
 * Refines the account kind of an already-matched message using keywords:
 * a credit-card mention anywhere in the text means the hint belongs to a
 * credit card even when the structural regex only captured a card number.
 */
function refineCardKind(text: string, parsed: ParsedFinancialMessage): ParsedFinancialMessage {
  if (parsed.accountKind === 'credit-card') return parsed;
  if (!parsed.accountHintLast4 && !parsed.destinationHintLast4) return parsed;
  if (!CREDIT_CARD_KEYWORDS.test(text)) return parsed;
  const refined: ParsedFinancialMessage = { ...parsed, accountKind: 'credit-card' };
  if (parsed.destinationHintLast4 && !parsed.accountHintLast4) {
    // Deposit-style messages credit the card account — move the hint over.
    refined.accountHintLast4 = parsed.destinationHintLast4;
    refined.destinationHintLast4 = undefined;
    refined.destinationKind = undefined;
    refined.kind = 'expense';
  }
  return refined;
}

/**
 * Keyword fallback for messages the per-bank regexes don't cover: needs a
 * card/account keyword, a last-4 hint, an explicitly marked amount and a
 * debit/credit verb, so random texts can't become transactions. Account
 * kind comes from the keywords — "credit card" / بطاقة ائتمانية → credit
 * card, otherwise a bank account ("sub account") hint.
 */
function parseByKeywords(text: string, provider: string): ParsedFinancialMessage | null {
  const cardHint = text.match(
    /(?:\*+\s*(\d{4})|(?:تنتهي|ending)\s*(?:بـ?|with)?\s*\*{0,4}\s*(\d{4}))/i,
  );
  if (!cardHint) return null;
  const hint = last4(cardHint[1] ?? cardHint[2]);

  const debitVerb = /تم\s*(?:ال)?(?:خصم|تحويل)|debited|purchase|used\s*for|payment\s*from/i.test(text);
  const creditVerb = /تم\s*(?:إضافة|اضافة|إيداع|ايداع)|credited|deposit/i.test(text);
  if (!debitVerb && !creditVerb) return null;

  const amountMatch = text.match(
    new RegExp(`مبلغ\\s*${CURRENCY_TOKEN}?\\s*${AMOUNT_TOKEN}\\s*${CURRENCY_TOKEN}?|(?:credited|debited)\\s+(?:with\\s+)?${CURRENCY_TOKEN}\\s+${AMOUNT_TOKEN}`, 'i'),
  );
  if (!amountMatch) return null;
  const value = amountMatch[2] ?? amountMatch[5];
  const currency = normalizeCurrencyToken(amountMatch[1] ?? amountMatch[3] ?? amountMatch[4]);
  if (!value || !currency) return null;

  const dateMatch = text.match(/(\d{2}\/\d{2}\/\d{4})|(\d{2}-\d{2}-\d{4})|(\d{4}-\d{2}-\d{2})|(\d{2}[A-Z]{3}\d{2,4})/i);
  let date = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    if (dateMatch[1]) date = numericDate(dateMatch[1]);
    else if (dateMatch[2]) date = numericDate(dateMatch[2]);
    else if (dateMatch[3]) date = dateMatch[3];
    else if (dateMatch[4]) date = compactDate(dateMatch[4]);
  }

  // Machine/ATM context keeps the cash-flow model: withdrawal = transfer to
  // the cash wallet, deposit = transfer from cash into the bank account.
  const isMachine = /الة رقم|ATM/i.test(text);
  if (isMachine) {
    return refineCardKind(text, {
      kind: 'transfer', provider,
      amount: amount(value),
      currency,
      date,
      description: creditVerb ? 'Cash deposit at machine' : 'ATM cash withdrawal',
      accountHintLast4: creditVerb ? undefined : hint,
      destinationHintLast4: creditVerb ? hint : undefined,
      accountKind: 'bank',
      destinationKind: creditVerb ? 'bank' : 'cash',
    });
  }

  return refineCardKind(text, {
    kind: debitVerb ? 'expense' : 'income',
    provider,
    amount: amount(value),
    currency,
    date,
    description: debitVerb ? 'Card/account debit' : 'Card/account credit',
    accountHintLast4: hint,
    accountKind: 'bank',
  });
}
