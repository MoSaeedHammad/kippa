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

function dayMonthDate(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${new Date().getUTCFullYear()}-${match[2]}-${match[1]}`;
}

function last4(value?: string): string | undefined {
  return value?.replace(/\D/g, '').slice(-4) || undefined;
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
    .replace(/\*{3,}\d{3,4}/g, '••••')
    .replace(/(?:Your available (?:balance|limit) is|with reference)\s+[^.]+\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

export function parseFinancialMessage(raw: string, source = 'sms', senderHint = ''): ParseResult {
  const text = raw.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim();
  if (!text) return { outcome: 'unsupported', reason: 'Message is empty.' };

  if (/statement date|minimum amount due|min\.?\s*amt due|total amt due/i.test(text)) {
    return { outcome: 'ignored', reason: 'Card statement alerts do not create transactions.' };
  }

  if (/تم تسجيل الدخول/.test(text)) {
    return { outcome: 'ignored', reason: 'Bank login alerts do not create transactions.' };
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
    /(?:HSBC Account\s*)?\*+(\d{4})\s+was credited with IPN inward transfer for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+from\s+(.+?)\s+with reference/i,
  );
  if (ipnInward) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider, accountKind: 'bank', accountHintLast4: ipnInward[1],
        currency: ipnInward[2].toUpperCase(), amount: amount(ipnInward[3]),
        date: numericDate(ipnInward[4]), description: `Transfer from ${cleanParty(ipnInward[5])}`,
        counterparty: cleanParty(ipnInward[5]),
      },
    };
  }

  const ipnPurchase = text.match(
    /(?:Your\s+)?HSBC Account\s*\*+(\d{4})\s+was debited with IPN purchase for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+from\s+(.+?)\s+with reference/i,
  );
  if (ipnPurchase) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, accountKind: 'bank', accountHintLast4: ipnPurchase[1],
        currency: ipnPurchase[2].toUpperCase(), amount: amount(ipnPurchase[3]),
        date: numericDate(ipnPurchase[4]), description: `Purchase from ${cleanParty(ipnPurchase[5])}`,
        counterparty: cleanParty(ipnPurchase[5]),
      },
    };
  }

  const ipnOutward = text.match(
    /(?:Your\s+)?HSBC Account\s*\*+(\d{4})\s+was debited with IPN outward transfer for\s+([A-Z]{3})\s+([\d,]+(?:\.\d{1,2})?)\s+on\s+(\d{2}-\d{2}-\d{4})(?:\s+\d{2}:\d{2})?\s+to\s+(.+?)\s+with reference/i,
  );
  if (ipnOutward) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider, accountKind: 'bank', accountHintLast4: ipnOutward[1],
        currency: ipnOutward[2].toUpperCase(), amount: amount(ipnOutward[3]),
        date: numericDate(ipnOutward[4]), description: `Transfer to ${cleanParty(ipnOutward[5])}`,
        counterparty: cleanParty(ipnOutward[5]),
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
  const misrTransferIn = text.match(
    /تم اضافة مبلغ\s*([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})\s*الى حساب رقم\s*x*(\d{4})\s*فى\s*(\d{2}-[A-Z]{3}-\d{4})\s*عن طريق التحويل اللحظي/i,
  );
  if (misrTransferIn) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'income', provider: 'bank-misr', accountKind: 'bank',
        date: compactDate(misrTransferIn[4]), description: 'Instant transfer in',
        accountHintLast4: misrTransferIn[3],
        currency: misrTransferIn[2].toUpperCase(), amount: amount(misrTransferIn[1]),
      },
    };
  }

  const misrTransferOut = text.match(
    /تم تحويل مبلغ\s*([\d,]+(?:\.\d{1,2})?)\s*([A-Z]{3})\s*من حساب رقم\s*x*(\d{4})\s*فى\s*(\d{2}-[A-Z]{3}-\d{4})\s*عن طريق التحويل اللحظي/i,
  );
  if (misrTransferOut) {
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider: 'bank-misr', accountKind: 'bank',
        date: compactDate(misrTransferOut[4]), description: 'Instant transfer out',
        accountHintLast4: misrTransferOut[3],
        currency: misrTransferOut[2].toUpperCase(), amount: amount(misrTransferOut[1]),
      },
    };
  }

  const misrCardCharge = text.match(
    /بطاقة بنك مصر الائتمانية\s*\*+\s*(\d{4})\s*[،,]?\s*تم خصم مبلغ\s*(?:(EGP|USD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:(EGP|USD))?\s*في\s*(.+?)\s*(?:[A-Z]{2}|>)?\s*بتاريخ\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (misrCardCharge) {
    const currency = (misrCardCharge[2] ?? misrCardCharge[4] ?? 'EGP').toUpperCase();
    return {
      outcome: 'matched',
      parsed: {
        kind: 'expense', provider: 'bank-misr', accountKind: 'credit-card',
        accountHintLast4: misrCardCharge[1], currency, amount: amount(misrCardCharge[3]),
        date: numericDate(misrCardCharge[6]),
        description: cleanParty(misrCardCharge[5]), counterparty: cleanParty(misrCardCharge[5]),
      },
    };
  }

  const misrCardPayment = text.match(
    /تم إيداع\s*(?:(EGP|USD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:(EGP|USD))?\s*بالبطاقة الائتمانية المنتهية\s*بـ\s*\*+\s*(\d{4})/i,
  );
  if (misrCardPayment) {
    const currency = (misrCardPayment[1] ?? misrCardPayment[3] ?? 'EGP').toUpperCase();
    return {
      outcome: 'notification',
      title: 'Credit-card payment detected',
      message: `${amount(misrCardPayment[2])} ${currency} reached card •${misrCardPayment[4]}. Match it to the charges you paid.`,
      deepLink: '/accounts',
    };
  }

  const misrMachineDebit = text.match(
    /بطاقة بنك مصر\s*\*+\s*(\d{4})\s*[،,]?\s*تم الخصم مبلغ\s*(?:(EGP|USD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:(EGP|USD))?\s*الة رقم\s*\d+.*?يوم\s*(\d{2}\/\d{2})/i,
  );
  if (misrMachineDebit) {
    const currency = (misrMachineDebit[2] ?? misrMachineDebit[4] ?? 'EGP').toUpperCase();
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider: 'bank-misr', accountKind: 'bank',
        accountHintLast4: misrMachineDebit[1],
        currency, amount: amount(misrMachineDebit[3]),
        date: dayMonthDate(misrMachineDebit[5]),
        description: 'ATM cash withdrawal', destinationKind: 'cash',
      },
    };
  }

  const misrMachineCredit = text.match(
    /بطاقة بنك مصر\s*\*+\s*(\d{4})\s*[،,]?\s*تم إضافة مبلغ\s*(?:(EGP|USD)\s*)?([\d,]+(?:\.\d{1,2})?)\s*(?:(EGP|USD))?\s*الة رقم\s*\d+.*?يوم\s*(\d{2}\/\d{2})/i,
  );
  if (misrMachineCredit) {
    const currency = (misrMachineCredit[2] ?? misrMachineCredit[4] ?? 'EGP').toUpperCase();
    return {
      outcome: 'matched',
      parsed: {
        kind: 'transfer', provider: 'bank-misr', accountKind: 'bank',
        // Cash deposits credit the bank account tied to the card; there is no
        // source bank account, so the hint is explicitly absent.
        destinationHintLast4: misrMachineCredit[1],
        accountHintLast4: undefined,
        currency, amount: amount(misrMachineCredit[3]),
        date: dayMonthDate(misrMachineCredit[5]),
        description: 'Cash deposit at machine', destinationKind: 'bank',
      },
    };
  }

  return { outcome: 'unsupported', reason: 'No supported financial transaction was found.' };
}
