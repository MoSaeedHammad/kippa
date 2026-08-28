import { describe, expect, it } from 'vitest';
import { buildMessagePreview, parseFinancialMessage } from './parser.js';

describe('parseFinancialMessage', () => {
  it('parses an HSBC debit-card purchase', () => {
    const result = parseFinancialMessage('From HSBC: 31JUL26 FAWRY*BEANOS Purchase from 074-096***-001 EGP 325.00- Your available balance is EGP 43,356.16');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', amount: 325, currency: 'EGP', date: '2026-07-31', description: 'FAWRY*BEANOS', accountHintLast4: '6001' } });
  });

  it('parses an ATM withdrawal as a transfer to cash', () => {
    const result = parseFinancialMessage('From HSBC: 27JUL26 ATM Cash Withdrawal from 074-096***-001 EGP 4,000.00- Your available balance is EGP 50,171.95');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', destinationKind: 'cash', amount: 4000 } });
  });

  it('parses a credit-card purchase', () => {
    const result = parseFinancialMessage('Your Credit Card ending with *** 7281 has been used for EGP 999.99 on 19/07/2026 at OPENAI *CHATGPT SUBSCR. Your available limit is EGP 52680.20');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', accountKind: 'credit-card', accountHintLast4: '7281', amount: 999.99, description: 'OPENAI *CHATGPT SUBSCR' } });
  });

  it('treats IPN inward as ordinary income', () => {
    const result = parseFinancialMessage('********1001 was credited with IPN inward transfer for EGP 225.00 on 17-07-2026 04:06 from person314271@instapay with reference e33925a9.');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', amount: 225, accountHintLast4: '1001', counterparty: 'person314271@instapay' } });
  });

  it('treats IPN purchase (debit from a merchant) as an ordinary expense', () => {
    const result = parseFinancialMessage('Your HSBC Account ********1001 was debited with IPN purchase for EGP 124.00 on 09-08-2026 01:39 from Nat Gas with reference c94e683c.');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', amount: 124, accountHintLast4: '1001', currency: 'EGP', counterparty: 'Nat Gas', description: 'Purchase from Nat Gas' } });
  });

  it('treats IPN outward as an ordinary expense', () => {
    const result = parseFinancialMessage('Your HSBC Account ********1001 was debited with IPN outward transfer for EGP 2,856.86 on 30-07-2026 03:47 to PERSON NAME with reference aaeb38db.');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', amount: 2856.86, accountHintLast4: '1001', description: 'Transfer to PERSON NAME' } });
  });

  it('parses a Phone Banking Transfer debit leg (from)', () => {
    const result = parseFinancialMessage('From HSBC: 02AUG26 Phone Banking Transfer from 074-096***-017 USD 2,000.00- Your available balance is USD 1,429.60');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: { kind: 'transfer', transferLeg: 'debit', mergeKey: 'phone-banking-transfer', amount: 2000, currency: 'USD', accountHintLast4: '6017' },
    });
  });

  it('parses a Phone Banking Transfer credit leg (to)', () => {
    const result = parseFinancialMessage('From HSBC: 02AUG26 Phone Banking Transfer to 074-096***-001 EGP 102,200.00+ Your available balance is EGP 141,678.41');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: { kind: 'transfer', transferLeg: 'credit', mergeKey: 'phone-banking-transfer', amount: 102200, currency: 'EGP', accountHintLast4: '6001' },
    });
  });

  it('parses an HSBC transfer debit without the Phone Banking prefix', () => {
    const result = parseFinancialMessage('From HSBC: 02AUG26 Transfer from 074-096***-001 EGP 38,112.39- Your available balance is EGP 51,421.02');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: { kind: 'expense', amount: 38112.39, currency: 'EGP', date: '2026-08-02', accountHintLast4: '6001' },
    });
  });

  it('ignores statement alerts', () => {
    expect(parseFinancialMessage('HSBC Credit Card ending *** 7281 Statement Date 11/07/2026. Total Amt Due EGP 216.81, Due Date 05/08/2026.')).toMatchObject({ outcome: 'ignored' });
  });

  it('routes card payments to the manual card flow instead of creating a pending transfer', () => {
    expect(parseFinancialMessage('Your Credit Card ending with *** 7281 has been credited with EGP 1,000.00')).toMatchObject({
      outcome: 'notification',
      deepLink: '/accounts',
    });
  });

  it('does not persist balances or account numbers in previews', () => {
    expect(buildMessagePreview('From HSBC: 27JUL26 ATM Cash Withdrawal from 074-096***-001 EGP 4,000.00- Your available balance is EGP 50,171.95')).not.toMatch(/50,171|074-096/);
  });
});

describe('parseFinancialMessage — Bank Misr', () => {
  it('parses an instant transfer in as income with the account hint', () => {
    const result = parseFinancialMessage('تم اضافة مبلغ 1980EGP       الى حساب رقم xxx7391      فى 30-AUG-2026  عن طريق التحويل اللحظي');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', provider: 'bank-misr', amount: 1980, currency: 'EGP', date: '2026-08-30', accountHintLast4: '7391', accountKind: 'bank', description: 'Instant transfer in' } });
  });

  it('parses an instant transfer out as an expense with the account hint', () => {
    const result = parseFinancialMessage('تم تحويل مبلغ 20,000EGP     من حساب رقم xxx7391       فى 30-AUG-2026  عن طريق التحويل اللحظي');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', provider: 'bank-misr', amount: 20000, currency: 'EGP', date: '2026-08-30', accountHintLast4: '7391', description: 'Instant transfer out' } });
  });

  it('ignores internet-banking login alerts', () => {
    const result = parseFinancialMessage('تم تسجيل الدخول علي حساب الانترنت البنكي الخاص بكم 27-08-2026 22:59:41');
    expect(result).toMatchObject({ outcome: 'ignored' });
  });
});
