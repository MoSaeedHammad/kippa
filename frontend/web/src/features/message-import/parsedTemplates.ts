/**
 * The bank-message templates the import (and live ingestion) recognizes, with
 * one real example each, shown in the import help so users can spot messages
 * that would not be recognized.
 *
 * Keep in sync with `backend/functions/src/domain/message-ingestion/parser.ts`
 * — every example below is also a parser test fixture.
 */
export const PARSED_TEMPLATE_GROUPS = [
  {
    bank: 'hsbc',
    templates: [
      {
        labelKey: 'parsedHelp.hsbc.purchase',
        example: 'From HSBC: 31JUL26 FAWRY*BEANOS Purchase from 074-096***-001 EGP 325.00-',
      },
      {
        labelKey: 'parsedHelp.hsbc.atm',
        example: 'From HSBC: 27JUL26 ATM Cash Withdrawal from 074-096***-001 EGP 4,000.00-',
      },
      {
        labelKey: 'parsedHelp.hsbc.phoneTransferDebit',
        example: 'From HSBC: 02AUG26 Phone Banking Transfer from 074-096***-017 USD 2,000.00-',
      },
      {
        labelKey: 'parsedHelp.hsbc.phoneTransferCredit',
        example: 'From HSBC: 02AUG26 Phone Banking Transfer to 074-096***-001 EGP 102,200.00+',
      },
      {
        labelKey: 'parsedHelp.hsbc.transferDebit',
        example: 'From HSBC: 02AUG26 Transfer from 074-096***-001 EGP 38,112.39-',
      },
      {
        labelKey: 'parsedHelp.hsbc.creditPurchase',
        example: 'Your Credit Card ending with *** 7281 has been used for EGP 999.99 on 19/07/2026 at OPENAI *CHATGPT SUBSCR.',
      },
      {
        labelKey: 'parsedHelp.hsbc.ipnInward',
        example: '********1001 was credited with IPN inward transfer for EGP 225.00 on 17-07-2026 04:06 from person@instapay with reference e33925a9.',
      },
      {
        labelKey: 'parsedHelp.hsbc.ipnPurchase',
        example: 'Your HSBC Account ********1001 was debited with IPN purchase for EGP 124.00 on 09-08-2026 01:39 from Nat Gas with reference c94e683c.',
      },
      {
        labelKey: 'parsedHelp.hsbc.ipnOutward',
        example: 'Your HSBC Account ********1001 was debited with IPN outward transfer for EGP 2,856.86 on 30-07-2026 03:47 to PERSON NAME with reference aaeb38db.',
      },
    ],
  },
  {
    bank: 'bankMisr',
    templates: [
      {
        labelKey: 'parsedHelp.bankMisr.transferIn',
        example: 'تم اضافة مبلغ 1980 EGP الى حساب رقم xxx7391 فى 30-AUG-2026 عن طريق التحويل اللحظي',
      },
      {
        labelKey: 'parsedHelp.bankMisr.transferOut',
        example: 'تم تحويل مبلغ 20,000 EGP من حساب رقم xxx7391 فى 30-AUG-2026 عن طريق التحويل اللحظي',
      },
      {
        labelKey: 'parsedHelp.bankMisr.cardCharge',
        example: 'بطاقة بنك مصر الائتمانية *2508، تم خصم مبلغ EGP 10 في WE-Mobile-Pre بتاريخ 27/08/2026',
      },
      {
        labelKey: 'parsedHelp.bankMisr.atmWithdrawal',
        example: 'بطاقة بنك مصر ****8616 ، تم الخصم مبلغ EGP 15000.00 الة رقم 01880117 يوم 25/08',
      },
      {
        labelKey: 'parsedHelp.bankMisr.cashDeposit',
        example: 'بطاقة بنك مصر ****8616، تم إضافة مبلغ EGP 9800.00 الة رقم 01880111 يوم 25/08',
      },
    ],
  },
] as const;

export type ParsedTemplateGroup = (typeof PARSED_TEMPLATE_GROUPS)[number];
