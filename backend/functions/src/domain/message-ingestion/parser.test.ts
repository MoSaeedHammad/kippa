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

  it('treats IPN inward as ordinary income with the instapay beneficiary and reference', () => {
    const result = parseFinancialMessage('********1001 was credited with IPN inward transfer for EGP 225.00 on 17-07-2026 04:06 from person314271@instapay with reference e33925a9.');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: {
        kind: 'income', amount: 225, accountHintLast4: '1001',
        counterparty: 'person314271@instapay', reference: 'e33925a9',
        description: 'Transfer from person314271@instapay (ref e33925a9)',
      },
    });
  });

  it('treats IPN purchase (debit from a merchant) as an ordinary expense', () => {
    const result = parseFinancialMessage('Your HSBC Account ********1001 was debited with IPN purchase for EGP 124.00 on 09-08-2026 01:39 from Nat Gas with reference c94e683c.');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: {
        kind: 'expense', amount: 124, accountHintLast4: '1001', currency: 'EGP',
        counterparty: 'Nat Gas', reference: 'c94e683c',
        description: 'Purchase from Nat Gas (ref c94e683c)',
      },
    });
  });

  it('treats IPN outward as an ordinary expense', () => {
    const result = parseFinancialMessage('Your HSBC Account ********1001 was debited with IPN outward transfer for EGP 2,856.86 on 30-07-2026 03:47 to PERSON NAME with reference aaeb38db.');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: {
        kind: 'expense', amount: 2856.86, accountHintLast4: '1001',
        counterparty: 'PERSON NAME', reference: 'aaeb38db',
        description: 'Transfer to PERSON NAME (ref aaeb38db)',
      },
    });
  });

  it('parses a Phone Banking Transfer debit leg (from)', () => {
    const result = parseFinancialMessage('From HSBC: 02AUG26 Phone Banking Transfer from 074-096***-017 USD 2,000.00- Your available balance is USD 1,429.60');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: { kind: 'transfer', transferLeg: 'debit', mergeKey: 'phone-banking-transfer', amount: 2000, currency: 'USD', accountHintLast4: '6017' },
    });
  });

  it('parses TT and Internet Banking payments as income in / expense out', () => {
    const credit = parseFinancialMessage('From HSBC: 18NOV21 TT Payment to 074-069***-001 EGP 200,000.00+ Your available balance is EGP 206,464.42');
    expect(credit).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', description: 'TT payment in', amount: 200000, accountHintLast4: '9001' } });
    const ibCredit = parseFinancialMessage('From HSBC: 25JUL21 Internet Banking Transfer to 074-069***-001 EGP 1,000.00+ Your available balance is EGP 1,030.67');
    expect(ibCredit).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', description: 'Internet banking transfer in', amount: 1000 } });
    const ibDebit = parseFinancialMessage('From HSBC: 18JUL21 Internet Banking Transfer from 074-069***-001 EGP 1,000.00- Your available balance is EGP 30.67');
    expect(ibDebit).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', description: 'Internet banking transfer out', amount: 1000 } });
    const ttDebit = parseFinancialMessage('From HSBC: 18AUG21 Internet Banking TT Payment from 074-069***-001 EGP 30,000.00- Your available balance is EGP 1,367.24');
    expect(ttDebit).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', description: 'TT payment out', amount: 30000 } });
  });

  it('parses a salary credit', () => {
    const result = parseFinancialMessage('From HSBC: 27JUL21 Salary to 074-069***-001 EGP 27,928.69+ Your available balance is EGP 28,959.36');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', description: 'Salary', amount: 27928.69 } });
  });

  it('parses a cheque debit with the cheque number as reference', () => {
    const result = parseFinancialMessage('From HSBC: 23NOV21 Cheque from 074-069***-001 with cheque no #107453 EGP 116,155.00- Your available balance is EGP 88,809.42');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: { kind: 'expense', description: 'Cheque #107453', reference: '107453', amount: 116155 },
    });
  });

  it('treats card payments as notifications, not transactions', () => {
    const transferToCard = parseFinancialMessage('From HSBC: 28SEP21 Transfer from 074-069***-001 EGP 1,889.43- to your Credit Card ending with 5986 as per your instruction. Your available balance is EGP 29,610.90');
    expect(transferToCard.outcome).toBe('notification');
    const thankYou = parseFinancialMessage('From HSBC: Thank you for the payment of EGP 2,412.12 for Credit Card ending *** 5986.');
    expect(thankYou.outcome).toBe('notification');
  });

  it('parses a Bank Misr instant transfer in with sender and reference', () => {
    const result = parseFinancialMessage('تم إضافة تحويل لحظي الي بطاقة رقم 452829******2508 بمبلغ 3000 من MOHAMED SAID MAHMOUD MOHAMED رقم مرجعي 184104 يوم 18/11/2025 الساعه 14:28 للمزيد اتصل علي 19888');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: {
        kind: 'income', amount: 3000, accountHintLast4: '2508',
        counterparty: 'MOHAMED SAID MAHMOUD MOHAMED', reference: '184104',
        description: 'Instant transfer from MOHAMED SAID MAHMOUD MOHAMED (ref 184104)',
      },
    });
  });

  it('parses a Bank Misr instant transfer out with beneficiary and reference', () => {
    const result = parseFinancialMessage('تم تنفيذ تحويل لحظي من حسابكم رقم 0634701368999001 بمبلغ 500 جم إلى GHADEER FATHY MOHAMED رقم مرجعي 123456 يوم 25/03/2026 الساعه 10:11 للمزيد اتصل ب 19888');
    expect(result).toMatchObject({
      outcome: 'matched',
      parsed: {
        kind: 'expense', amount: 500, currency: 'EGP',
        counterparty: 'GHADEER FATHY MOHAMED', reference: '123456',
        description: 'Instant transfer to GHADEER FATHY MOHAMED (ref 123456)',
      },
    });
  });

  it('parses Bank Misr branch cash deposits and withdrawals', () => {
    const deposit = parseFinancialMessage('تم ايداع مبلغ 5000EGP فى حساب رقم xxx7391 فى 15/06/2026');
    expect(deposit).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', destinationKind: 'bank', amount: 5000, currency: 'EGP', destinationHintLast4: '7391' } });
    const depositUsd = parseFinancialMessage('تم ايداع مبلغ 2000USD فى حساب رقم xxx7391 فى 12/05/2026');
    expect(depositUsd).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', currency: 'USD', amount: 2000 } });
    const withdrawal = parseFinancialMessage('تم سحب مبلغ 200USD نقداً من حساب رقم xxx7391 فى 12/06/2026');
    expect(withdrawal).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', destinationKind: 'cash', amount: 200, currency: 'USD' } });
  });

  it('parses a Bank Misr card refund and a terminal credit', () => {
    const refund = parseFinancialMessage('عميلنا العزيز، تم رد المعاملة بقيمة 1229EGP للبطاقة *****2508، بتاريخ 12/11/2025 من Uber ، للاطلاع على معاملاتكم اضغط bnkmsr.com/online');
    expect(refund).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', counterparty: 'Uber', amount: 1229, description: 'Refund from Uber' } });
    const terminal = parseFinancialMessage('Dear Customer, your account 1000026834001 is credited by 5000 on 20/06/2026 14:06 , terminal 01880127 , for more info. call 19888');
    expect(terminal).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', amount: 5000, description: 'Cash deposit at terminal' } });
  });

  it('ignores security alerts, PIN/OTP messages, declines and service noise', () => {
    const noise = [
      'From HSBC: Transfer to third party account is done from your account via Internet Banking. If you have not done this transaction, please contact HSBC Egypt',
      'From HSBC: A biller or payment information is added on your profile via Internet Banking. If you have not done this transaction,please contact HSBC Egypt',
      'Please use PIN 405365 to complete your transaction for EGP20.0 with HSBC card ending 5986. If you did not request a PIN, please call us.',
      'Use PIN 742373 to pay EUR 2.50 at Comutitres - with HSBC card ending 2930. Call the number on the card\'s back if you didn\'t do this transaction.',
      'Transaction EGP 350.00 on Card ending *** 3171 was declined due to invalid PIN.',
      'عميلنا العزيز، برجاء عدم الافصاح عن الكود OTP: 23189 الصالح لمره واحدة لإتمام معاملة الدفع بمبلغ EGP 86.00 من WAFFARHA بطاقة رقم xxxx-xxxx-xxxx-2508',
      'From HSBC: The HSBC Team wishes you a Happy Birthday and many happy returns of the day!',
      'From HSBC: This is to notify you that your transaction via HSBC Online/Mobile Banking was  not successful.',
      'Dear customer, your card ****2508 statement is issued with total EGP 24067.17, minimum due is EGP 1203.36, due before 26/01/2026',
      'عميلنا العزيز، تم رفض العملية بالبطاقة ****2508 لتجاوز حد الاستخدام الدولي ،  الرصيد المتاح بالبطاقة EGP 294438',
      'عميلنا العزيز، تم الغاء ايداع مبلغ 2000USD فى حساب رقم xxx7391 فى 12/06/2026',
      'Your HSBC Account XXX001 IPN PIN has been set successfully.',
    ];
    for (const text of noise) {
      expect(parseFinancialMessage(text).outcome, text.slice(0, 40)).toBe('ignored');
    }
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

  it('masks Arabic balances and single-star card markers in Bank Misr previews', () => {
    const preview = buildMessagePreview('عميلنا العزيز، شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية *2508، تم خصم مبلغ EGP 10 في WE-Mobile-Pre          Gi بتاريخ 27/08/2026، الرصيدالمتاحEGP 256692.68، للاطلاع  اضغط على bnkmsr.com/online');
    expect(preview).not.toContain('256692.68');
    expect(preview).not.toContain('2508');
    expect(preview).toContain('WE-Mobile-Pre');
    expect(preview).toContain('27/08/2026');
  });

  it('masks the Arabic balance in Bank Misr machine-withdrawal previews', () => {
    const preview = buildMessagePreview('شكرًا لاستخدامك بطاقة بنك مصر ****8616 ، تم الخصم مبلغEGP 15000.00  الة رقم 01880117 BM F.D SMA يوم  25/08 ، الرصيد المتاحEGP 173908.57لمزيد من المعلومات اضغط هنا bnkmsr.com/online');
    expect(preview).not.toContain('173908.57');
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

  it('parses a Bank Misr credit-card charge with a spaced province code', () => {
    const result = parseFinancialMessage('عميلنا العزيز، شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية *2508، تم خصم مبلغ EGP 10 في WE-Mobile-Pre          Gi بتاريخ 27/08/2026، الرصيدالمتاحEGP 256692.68، للاطلاع  اضغط على bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', provider: 'bank-misr', accountKind: 'credit-card', accountHintLast4: '2508', currency: 'EGP', amount: 10, date: '2026-08-27', description: 'WE-Mobile-Pre', counterparty: 'WE-Mobile-Pre' } });
  });

  it('parses a Bank Misr credit-card charge with a glued province code', () => {
    const result = parseFinancialMessage('عميلناالعزيز،شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية*2508 تم خصم مبلغ EGP 800 فيHK STORES              SPبتاريخ 22/08/2026،الرصيدالمتاحEGP 181564.92،وحدالاستخدام الدولي المتاحEGP148696.7للمزيداتصل 19888');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { accountHintLast4: '2508', amount: 800, description: 'HK STORES' } });
  });

  it('parses a real Bank Misr card charge with a > placeholder and double commas (production sample)', () => {
    const result = parseFinancialMessage('عميلنا العزيز، شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية *1234، تم خصم مبلغ EGP 354 في GEIDEAE*Elmostafa mall > بتاريخ 12/09/2026،، للاطلاع اضغط على bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', accountKind: 'credit-card', currency: 'EGP', amount: 354, date: '2026-09-12', description: 'GEIDEAE*Elmostafa mall', counterparty: 'GEIDEAE*Elmostafa mall' } });
  });

  it('parses a Bank Misr credit-card charge with a > placeholder instead of a province code', () => {
    const result = parseFinancialMessage('عميلنا العزيز، شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية *2508، تم خصم مبلغ EGP 165 في AmanPF*Shadia Pharmacy  > بتاريخ 25/08/2026، الرصيدالمتاحEGP 177380.92، للاطلاع  اضغط على bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { amount: 165, description: 'AmanPF*Shadia Pharmacy' } });
  });

  it('parses a USD international Bank Misr credit-card charge', () => {
    const result = parseFinancialMessage('عميلناالعزيز،شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية*2508 تم خصم مبلغ USD 5.8 فيOPENROUTER, INC        NEبتاريخ 28/08/2026،الرصيدالمتاحEGP 256400.94،وحدالاستخدام الدولي المتاحEGP148404.96للمزيداتصل 19888');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { currency: 'USD', amount: 5.8, date: '2026-08-28', description: 'OPENROUTER, INC' } });
  });

  it('routes Bank Misr card-payment deposits to the manual card flow', () => {
    const result = parseFinancialMessage('عميلنا العزيز، تم إيداع EGP 39700.38 بالبطاقة الائتمانية المنتهية بـ ****2508، فى BM-Online يوم  26/08/2026 ، ورصيدكم الحالي 216502.3 EGP، للاطلاع على معاملاتكم اضغط bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'notification', deepLink: '/accounts' });
  });

  it('parses a machine (ATM) withdrawal on a debit card as a transfer to cash', () => {
    const result = parseFinancialMessage('شكرًا لاستخدامك بطاقة بنك مصر  ****8616 ، تم الخصم مبلغEGP 15000.00  الة رقم 01880117 BM F.D SMA يوم  25/08 ، الرصيد المتاحEGP 173908.57لمزيد من المعلومات اضغط هنا bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', provider: 'bank-misr', accountHintLast4: '8616', destinationKind: 'cash', currency: 'EGP', amount: 15000, date: `${new Date().getUTCFullYear()}-08-25`, description: 'ATM cash withdrawal' } });
  });

  it('parses a machine cash deposit as a transfer from cash into the bank account', () => {
    const result = parseFinancialMessage('شكرًا لاستخدامك بطاقة بنك مصر ****8616، تم إضافة مبلغEGP 9800.00 الة رقم 01880111 BM F.D SMA يوم 25/08، الرصيد المتاح EGP 188908.57لمزيد من المعلومات اضغط هنا bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', provider: 'bank-misr', destinationKind: 'bank', destinationHintLast4: '8616', accountHintLast4: undefined, currency: 'EGP', amount: 9800, description: 'Cash deposit at machine' } });
  });

  it('parses a credit-card charge phrased without the bank name', () => {
    const result = parseFinancialMessage('عميلنا العزيز، شكرًا لاستخدامكم بطاقة ائتمانية *5510، تم خصم مبلغ EGP 240 في TALABAT      EG بتاريخ 01/09/2026');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', provider: 'bank-misr', accountKind: 'credit-card', accountHintLast4: '5510', amount: 240, currency: 'EGP', date: '2026-09-01', description: 'TALABAT' } });
  });

  it('keeps a non-EGP/USD currency such as EUR', () => {
    const result = parseFinancialMessage('عميلناالعزيز،شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية*2508 تم خصم مبلغ EUR 12.5 فيNETFLIX.COM      LUبتاريخ 02/09/2026');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', accountKind: 'credit-card', currency: 'EUR', amount: 12.5, date: '2026-09-02' } });
  });

  it('parses a transfer to a long sub-account number with the حسابي wording', () => {
    const result = parseFinancialMessage('تم اضافة مبلغ 500USD       الى حسابي رقم 9876544321      فى 30-AUG-2026  عن طريق التحويل اللحظي');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'income', provider: 'bank-misr', accountKind: 'bank', currency: 'USD', amount: 500, accountHintLast4: '4321', date: '2026-08-30' } });
  });

  it('extracts a credit-card charge from keywords when no bank regex fits', () => {
    const result = parseFinancialMessage('بطاقة ائتمانية تنتهي بـ 4321، تم خصم مبلغ USD 25 في واتر شرك 05/09/2026');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', accountKind: 'credit-card', accountHintLast4: '4321', currency: 'USD', amount: 25, date: '2026-09-05' } });
  });

  it('keyword fallback maps machine debits to a cash transfer', () => {
    const result = parseFinancialMessage('البطاقة الائتمانية ****7700 تم الخصم مبلغEGP 3000 الة رقم 55 يوم 12/09/2026');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', destinationKind: 'cash', accountHintLast4: '7700', accountKind: 'credit-card', currency: 'EGP', amount: 3000 } });
  });

  it('never parses statement noise even when it contains amounts', () => {
    expect(parseFinancialMessage('بطاقة ائتمانية *1234 Statement Date 11/07/2026. Total Amt Due EGP 216.81')).toMatchObject({ outcome: 'ignored' });
  });
});
