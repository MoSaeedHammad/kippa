# Bank Misr SMS Ingestion + Android Forwarder Support — Design

**Date:** 2026-08-29
**Status:** Approved (approach A; design parts 1 & 2 reviewed with user)
**Scope:** Message-ingestion backend, shared domain types, pending-approval frontend.

## Goal

Track Bank Misr and HSBC bank SMS on an Android phone and reflect them as
reviewable pending items that map onto the user's Kippa accounts and credit
cards, through the existing `ingestFinancialMessage` webhook pipeline.

HSBC parsing already exists. The work is: Bank Misr message parsing,
Android-forwarder tolerance at the webhook, cash-deposit transfers, and
foreign-currency (USD) credit-card charges converted to EGP at approval.

## Decisions (from user Q&A)

| Question | Decision |
| --- | --- |
| Source of Bank Misr formats | Real SMS samples pasted by the user (Egyptian Arabic) |
| `BM F.D SMA` machine messages | Additions = cash deposits (CDM); deduction = ATM withdrawal |
| USD charges on EGP credit card | Convert to EGP at approval; USD original + rate preserved |
| Android delivery | SMS-forwarder app POSTs directly to the webhook (no bridge) |
| Architecture | Approach A — extend the existing single parser (per-provider modules deferred until a third bank) |

## A. Webhook contract (Android-friendly, backward compatible)

`ingestFinancialMessage` keeps `POST` + `Authorization: Bearer <credentialId>.<secret>`
and gains body tolerance:

- **Content types:** JSON, `application/x-www-form-urlencoded`, or raw text body.
- **Message field:** first non-empty string among `message` / `text` / `body` / `sms` / `content`.
- **Optional fields:** `sender` (e.g. `BankMisr`; strengthens bank detection),
  `source` (forwarder app name; default changes `ios-shortcut` → `device`),
  `idempotencyKey`, `receivedAt` — semantics unchanged.
- Dedupe receipts, rate limiting, membership checks, response shapes: unchanged.

Android app requirement: URL + Bearer header + `{ "text": "<sms>", "sender": "BankMisr" }`.

## B. Bank Misr parser patterns

All patterns derived from real samples; `provider: 'bank-misr'` when matched
(text markers: `بنك مصر`, `bnkmsr`, machine/card phrasing; `sender` hint optional).

| SMS marker (Arabic) | Parse result |
| --- | --- |
| `تم اضافة مبلغ <amt><CUR> الى حساب رقم xxx<last4> فى <DD-MON-YYYY> عن طريق التحويل اللحظي` | `income` → bank acct `last4` |
| `تم تحويل مبلغ <amt><CUR> من حساب رقم xxx<last4> فى <DD-MON-YYYY> عن طريق التحويل اللحظي` | `expense` from acct `last4` |
| `بطاقة بنك مصر الائتمانية *<last4>، تم خصم مبلغ <CUR> <amt> في <merchant> [code] بتاريخ <DD/MM/YYYY>` | `expense` on **credit card** `last4`; currency may be EGP or USD |
| `شكرًا لاستخدامك بطاقة بنك مصر ****<last4>، تم الخصم مبلغ <CUR> <amt> الة رقم … يوم <DD/MM>` | `transfer` → **cash** (ATM withdrawal; mirrors HSBC) |
| `شكرًا لاستخدامك بطاقة بنك مصر ****<last4>، تم إضافة مبلغ <CUR> <amt> الة رقم … يوم <DD/MM>` | `transfer` **cash → bank acct** behind debit card (new `destinationKind: 'bank'`) |
| `تم إيداع <CUR> <amt> بالبطاقة الائتمانية المنتهية بـ ****<last4>` | `notification` → deep link `/accounts` (card-payment flow) |
| `تم تسجيل الدخول علي حساب الانترنت البنكي…` | `ignored` (noise) |

Robustness requirements:

- Amounts: space or no space before currency (`1980EGP`, `EGP 10`), thousands
  commas, decimals (`5.8`, `39700.38`, `15,000.00`).
- Dates: `30-AUG-2026` (existing `compactDate`), `27/08/2026` (existing
  `numericDate`), `25/08` (new: day/month, current year inferred at ingestion).
- Merchant capture stops before the trailing POS junk: a 2-letter province code
  or `>`, glued (`SPبتاريخ`) or spaced (`Gi بتاريخ`, `> بتاريخ`), with
  irregular internal spacing collapsed by `cleanParty`.
- Arabic spacing irregularities (missing/extra spaces) tolerated with `\s*`.
- Login-alert guard runs before transaction patterns.

### Suggestion resolution extension

`resolveSuggestions` gains `destinationKind: 'bank'`:

- destination account = debit-card `last4` → `parentAccountId`, else the single
  running account in the message currency;
- source account = the household's single active cash account (ambiguous when
  multiple cash accounts exist → user picks in the dialog).

Everything downstream (pending doc, review dialog, approval, ledger lines,
audit log, notifications) flows through the existing pipeline unchanged.

## C. USD credit-card charges → EGP at approval

- At ingestion, when a credit-card charge's currency ≠ the card parent
  account's currency, `resolveSuggestions` sets **`conversionRequired: true`**
  on the pending; the pending keeps the truthful original (`amount: 5.8,
  currency: 'USD'`).
- `approvePendingFinancialMessage` accepts an optional `convertedAmount`
  (major units, account currency). When `conversionRequired`:
  - `convertedAmount` is required and must be > 0;
  - the account must be the suggested card's parent account;
  - the pending-currency equality check is skipped for this case;
  - the transaction is written in the account currency (EGP) with
    `originalCharge { currency, amount, rate }` preserved on the transaction
    (mirrors the existing `conversionDetails` pattern for cross-currency transfers).
- Server-side guard: conversion-required pendings cannot be approved without
  the converted amount or against a non-card account.

## D. Frontend changes

1. `packages/domain` — `PendingFinancialMessage.conversionRequired?: boolean | null`;
   transaction type gains `originalCharge?: { currency: string; amount: number; rate: number } | null`.
2. `PendingReviewDialog.tsx` — conversion-required pendings show the original
   (`USD 5.8 @ MERCHANT`), an EGP amount input with a live rate hint, lock the
   account to the suggested card account, and pass `convertedAmount` through
   the mutation. Other pendings unchanged.
3. `PendingTransactions.tsx` — account filter (`account.currency === selected.currency`)
   additionally offers the suggested card parent account for conversion-required
   pendings; server re-validates.
4. `MessageConnectionDialog.tsx` — default label "iPhone Shortcut" → "SMS forwarder";
   endpoint/token surfaced copy-friendly for Android setup.

## E. Tests

- `parser.test.ts` (+~12 cases from real samples): transfer in/out (no-space
  amount, `DD-MON-YYYY`), card EGP charges across merchant-code variants
  (`Gi بتاريخ`, glued `SPبتاريخ`, `> بتاريخ`, multi-space names), USD charge,
  comma/decimal amounts, CDM deposit (`destinationKind: 'bank'`), machine
  withdrawal (cash transfer), card-payment deposit (notification), login alert
  (ignored).
- `PendingReviewDialog.test.tsx` — conversion flow: shows original, blocks
  submit without EGP amount, sends `convertedAmount`.
- Existing HSBC tests remain green (no behavior change).

## F. Rollout

1. Backend + domain types → `npm run functions:test` → deploy functions with
   `FUNCTIONS_DISCOVERY_TIMEOUT=120 npm run deploy:functions`.
2. Frontend → build → `npm run deploy:web`.
3. Live verification: curl the deployed webhook with a real sample using an
   existing credential token → pending appears → approve with EGP conversion.
4. Android setup on the user's phone: SMS-forwarder rule (sender `BankMisr` /
   `HSBC`) → POST `{ "text": "%text%", "sender": "%sender%" }` with Bearer header.
5. Docs: "Bank SMS ingestion" section in `docs/docs/notifications.md`
   (contract, Android config, supported-message matrix).

## Non-goals

- Bank APIs / open banking — SMS parsing only.
- Firestore-configurable patterns (approach C, rejected).
- Telegram bridge (rejected in favor of direct forwarder → webhook).
- Historic backfill (only new messages from setup onward).
