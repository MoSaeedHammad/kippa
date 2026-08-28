# Bank Misr SMS Ingestion + Android Forwarder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse Bank Misr Arabic bank SMS through the existing `ingestFinancialMessage` webhook so Android-forwarded messages become reviewable pending items mapped to accounts and credit cards — including cash-deposit transfers and USD card charges converted to EGP at approval.

**Architecture:** Approach A from the approved spec (`docs/superpowers/specs/2026-08-29-bank-misr-android-ingestion-design.md`): extend the existing single parser with Bank Misr patterns; extract two small pure domain helpers (`pickSuggestions`, `settledAmounts`) for testability; make the webhook body tolerant of Android forwarder payloads; add a conversion step to the pending-approval flow.

**Tech Stack:** TypeScript, firebase-functions v2, Firestore, React 19 + MUI 7, Vitest + Testing Library, npm workspaces (`kippa-functions`, `kippa-app`, `@kippa/domain`).

## Global Constraints

- Functions runtime is pinned to `nodejs22`; the local Node only builds TS.
- Workspace commands from repo root: `npm run functions:test`, `npm run typecheck` (app), `npm --prefix backend/functions run test`, `npm run test --workspace=kippa-app`.
- AGENTS.md UI rules: feature components must not set typography (font size/weight/etc.) through `sx` — use named variants (`variant="body2"`, `variant="fieldHint"`, …) and component props; `sx` for layout only. Icons via shared `AppIcon` only.
- Deploys on this machine require `FUNCTIONS_DISCOVERY_TIMEOUT=120` (10s default times out on Windows).
- Real SMS samples are the source of truth for parser behavior; tests quote them verbatim (they are already masked to `xxx7391`-style hints).
- Never commit local config files (`.firebaserc`, `firebase.json`, `frontend/web/.env`, `firebase-messaging-sw.js`) — they are gitignored.

---

### Task 1: Shared domain types

**Files:**
- Modify: `packages/domain/src/index.d.ts:114-134` (FinanceTransaction), `:297-328` (PendingFinancialMessage)

**Interfaces:**
- Produces: `PendingFinancialMessage.conversionRequired?: boolean | null` and `FinanceTransaction.originalCharge?: { currency: CurrencyCode; amount: number; rate: number } | null` — every later task uses these exact names.

- [ ] **Step 1: Add `conversionRequired` to PendingFinancialMessage**

In `packages/domain/src/index.d.ts`, inside `PendingFinancialMessage`, after the `mergeKey` line (~line 325):

```ts
  /** True when a credit-card charge arrived in a currency different from the card's parent account; approval must supply the converted amount. */
  conversionRequired?: boolean | null;
```

- [ ] **Step 2: Add `originalCharge` to FinanceTransaction**

In the same file, inside `FinanceTransaction`, after `loanInstallmentNumber` (~line 133):

```ts
  /** Present when an imported card charge settled in the account currency after conversion from its original currency. */
  originalCharge?: { currency: CurrencyCode; amount: number; rate: number } | null;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck && npm --prefix backend/functions run build`
Expected: both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/index.d.ts
git commit -m "feat(domain): conversionRequired flag and originalCharge on transactions"
```

---

### Task 2: Parser — Bank Misr instant transfers + login-alert guard

**Files:**
- Modify: `backend/functions/src/domain/message-ingestion/parser.ts`
- Test: `backend/functions/src/domain/message-ingestion/parser.test.ts`

**Interfaces:**
- Produces: matched results with `provider: 'bank-misr'`, `accountKind: 'bank'`, `description: 'Instant transfer in' | 'Instant transfer out'`; ignored outcome for login alerts. Consumes existing helpers `compactDate`, `amount`, `last4`.

- [ ] **Step 1: Write the failing tests**

Append to `parser.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend/functions run test`
Expected: 3 FAIL ("No supported financial transaction was found." outcome instead).

- [ ] **Step 3: Implement**

In `parser.ts`, add the login guard directly below the existing statement-alert guard (~line 74):

```ts
  if (/تم تسجيل الدخول/.test(text)) {
    return { outcome: 'ignored', reason: 'Bank login alerts do not create transactions.' };
  }
```

Then, after the HSBC `cardPayment` block and before the final `unsupported` return (~line 231), add:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend/functions run test`
Expected: all PASS (existing HSBC tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add backend/functions/src/domain/message-ingestion/parser.ts backend/functions/src/domain/message-ingestion/parser.test.ts
git commit -m "feat(functions): parse Bank Misr instant transfer SMS"
```

---

### Task 3: Parser — Bank Misr credit-card charges (EGP + USD) and card payments

**Files:**
- Modify: `backend/functions/src/domain/message-ingestion/parser.ts`
- Test: `backend/functions/src/domain/message-ingestion/parser.test.ts`

**Interfaces:**
- Produces: card-charge matches with `accountKind: 'credit-card'`, `accountHintLast4` = card last4, currency `EGP` or `USD`; card-payment deposits produce `{ outcome: 'notification', deepLink: '/accounts' }` (same contract as the HSBC cardPayment branch).

- [ ] **Step 1: Write the failing tests**

Append inside the Bank Misr describe block:

```ts
  it('parses a Bank Misr credit-card charge with a spaced province code', () => {
    const result = parseFinancialMessage('عميلنا العزيز، شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية *2508، تم خصم مبلغ EGP 10 في WE-Mobile-Pre          Gi بتاريخ 27/08/2026، الرصيدالمتاحEGP 256692.68، للاطلاع  اضغط على bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'expense', provider: 'bank-misr', accountKind: 'credit-card', accountHintLast4: '2508', currency: 'EGP', amount: 10, date: '2026-08-27', description: 'WE-Mobile-Pre', counterparty: 'WE-Mobile-Pre' } });
  });

  it('parses a Bank Misr credit-card charge with a glued province code', () => {
    const result = parseFinancialMessage('عميلناالعزيز،شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية*2508 تم خصم مبلغ EGP 800 فيHK STORES              SPبتاريخ 22/08/2026،الرصيدالمتاحEGP 181564.92،وحدالاستخدام الدولي المتاحEGP148696.7للمزيداتصل 19888');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { accountHintLast4: '2508', amount: 800, description: 'HK STORES' } });
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend/functions run test`
Expected: 5 FAIL.

- [ ] **Step 3: Implement**

In `parser.ts`, inside the Bank Misr section (after `misrTransferOut`, before machine patterns which arrive in Task 4):

```ts
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
```

Notes for the implementer: the parser normalizes whitespace (`\s+` → single space) and dashes at the top of `parseFinancialMessage`, so the multi-space samples collapse before matching. The merchant group is lazy and stops before an optional trailing 2-letter province code or `>` marker — do not make it greedy.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend/functions run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/functions/src/domain/message-ingestion/parser.ts backend/functions/src/domain/message-ingestion/parser.test.ts
git commit -m "feat(functions): parse Bank Misr card charges and payment deposits"
```

---

### Task 4: Parser — Bank Misr machine withdrawal + cash deposit (`destinationKind: 'bank'`)

**Files:**
- Modify: `backend/functions/src/domain/message-ingestion/parser.ts` (type `ParsedFinancialMessage` + new patterns)
- Test: `backend/functions/src/domain/message-ingestion/parser.test.ts`

**Interfaces:**
- Produces: `ParsedFinancialMessage.destinationKind: 'cash' | 'credit-card' | 'bank'` (type widened). Machine withdrawal → `kind: 'transfer'`, `destinationKind: 'cash'`, `accountHintLast4` = debit card. Cash deposit → `kind: 'transfer'`, `destinationKind: 'bank'`, `destinationHintLast4` = debit card, no `accountHintLast4`.

- [ ] **Step 1: Write the failing tests**

Append inside the Bank Misr describe block:

```ts
  it('parses a machine (ATM) withdrawal on a debit card as a transfer to cash', () => {
    const result = parseFinancialMessage('شكرًا لاستخدامك بطاقة بنك مصر  ****8616 ، تم الخصم مبلغEGP 15000.00  الة رقم 01880117 BM F.D SMA يوم  25/08 ، الرصيد المتاحEGP 173908.57لمزيد من المعلومات اضغط هنا bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', provider: 'bank-misr', accountHintLast4: '8616', destinationKind: 'cash', currency: 'EGP', amount: 15000, date: `${new Date().getUTCFullYear()}-08-25`, description: 'ATM cash withdrawal' } });
  });

  it('parses a machine cash deposit as a transfer from cash into the bank account', () => {
    const result = parseFinancialMessage('شكرًا لاستخدامك بطاقة بنك مصر ****8616، تم إضافة مبلغEGP 9800.00 الة رقم 01880111 BM F.D SMA يوم 25/08، الرصيد المتاح EGP 188908.57لمزيد من المعلومات اضغط هنا bnkmsr.com/online');
    expect(result).toMatchObject({ outcome: 'matched', parsed: { kind: 'transfer', provider: 'bank-misr', destinationKind: 'bank', destinationHintLast4: '8616', accountHintLast4: undefined, currency: 'EGP', amount: 9800, description: 'Cash deposit at machine' } });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend/functions run test`
Expected: 2 FAIL.

- [ ] **Step 3: Implement**

3a. Widen the type in `ParsedFinancialMessage` (~line 12):

```ts
  destinationKind?: 'cash' | 'credit-card' | 'bank';
```

3b. Add a date helper next to `numericDate` (~line 44):

```ts
function dayMonthDate(value: string): string {
  const match = value.match(/^(\d{2})\/(\d{2})$/);
  if (!match) return new Date().toISOString().slice(0, 10);
  return `${new Date().getUTCFullYear()}-${match[2]}-${match[1]}`;
}
```

3c. Add the patterns inside the Bank Misr section (after `misrCardPayment`):

```ts
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
        destinationHintLast4: misrMachineCredit[1],
        currency, amount: amount(misrMachineCredit[3]),
        date: dayMonthDate(misrMachineCredit[5]),
        description: 'Cash deposit at machine', destinationKind: 'bank',
      },
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend/functions run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/functions/src/domain/message-ingestion/parser.ts backend/functions/src/domain/message-ingestion/parser.test.ts
git commit -m "feat(functions): parse Bank Misr machine withdrawals and cash deposits"
```

---

### Task 5: Pure suggestion resolver (`pickSuggestions`)

**Files:**
- Create: `backend/functions/src/domain/message-ingestion/suggestions.ts`
- Test: `backend/functions/src/domain/message-ingestion/suggestions.test.ts`

**Interfaces:**
- Consumes: `ParsedFinancialMessage` from `./parser.js`, `Account`/`Card` from `@kippa/domain`.
- Produces: `pickSuggestions(accounts: Account[], cards: Card[], parsed: ParsedFinancialMessage): { accountId?: string; destinationAccountId?: string; conversionRequired: boolean }`. Task 7/8 import it from `../../domain/message-ingestion/suggestions.js`.

- [ ] **Step 1: Write the failing tests**

Create `suggestions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Account, Card } from '@kippa/domain';
import { pickSuggestions } from './suggestions.js';

const egpRunning: Account = { id: 'bm-egp', householdId: 'h', name: 'Bank Misr EGP', type: 'running', currency: 'EGP', isActive: true, sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' };
const egpCash: Account = { id: 'cash', householdId: 'h', name: 'Cash', type: 'cash', currency: 'EGP', isActive: true, sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' };
const egpCredit: Account = { id: 'bm-card-account', householdId: 'h', name: 'Bank Misr Card', type: 'credit', currency: 'EGP', isActive: true, sortOrder: 2, createdAt: '2026-01-01T00:00:00.000Z' };
const debitCard: Card = { id: 'debit-8616', householdId: 'h', name: 'Debit', kind: 'debit', last4: '8616', parentAccountId: 'bm-egp', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', status: 'no_statement' } as unknown as Card;
const creditCard: Card = { id: 'credit-2508', householdId: 'h', name: 'Card', kind: 'credit', last4: '2508', parentAccountId: 'bm-card-account', isActive: true, createdAt: '2026-01-01T00:00:00.000Z', status: 'no_statement' } as unknown as Card;
const accounts = [egpRunning, egpCash, egpCredit];

describe('pickSuggestions', () => {
  it('suggests the debit card parent for an instant transfer out', () => {
    expect(pickSuggestions(accounts, [debitCard], {
      kind: 'expense', provider: 'bank-misr', amount: 20000, currency: 'EGP', date: '2026-08-30', description: 'Instant transfer out', accountHintLast4: '7391', accountKind: 'bank',
    })).toMatchObject({ accountId: 'bm-egp' });
  });

  it('maps an ATM withdrawal to the card account with a cash destination', () => {
    expect(pickSuggestions(accounts, [debitCard], {
      kind: 'transfer', provider: 'bank-misr', amount: 15000, currency: 'EGP', date: '2026-08-25', description: 'ATM cash withdrawal', accountHintLast4: '8616', accountKind: 'bank', destinationKind: 'cash',
    })).toMatchObject({ accountId: 'bm-egp', destinationAccountId: 'cash' });
  });

  it('maps a cash deposit from cash into the card parent account', () => {
    expect(pickSuggestions(accounts, [debitCard], {
      kind: 'transfer', provider: 'bank-misr', amount: 9800, currency: 'EGP', date: '2026-08-25', description: 'Cash deposit at machine', destinationHintLast4: '8616', accountKind: 'bank', destinationKind: 'bank',
    })).toMatchObject({ accountId: 'cash', destinationAccountId: 'bm-egp' });
  });

  it('flags a USD credit-card charge on an EGP card account for conversion', () => {
    expect(pickSuggestions(accounts, [creditCard], {
      kind: 'expense', provider: 'bank-misr', amount: 5.8, currency: 'USD', date: '2026-08-28', description: 'OPENROUTER, INC', accountHintLast4: '2508', accountKind: 'credit-card',
    })).toMatchObject({ accountId: 'bm-card-account', conversionRequired: true });
  });

  it('does not flag an EGP credit-card charge for conversion', () => {
    expect(pickSuggestions(accounts, [creditCard], {
      kind: 'expense', provider: 'bank-misr', amount: 10, currency: 'EGP', date: '2026-08-27', description: 'WE-Mobile-Pre', accountHintLast4: '2508', accountKind: 'credit-card',
    })).toMatchObject({ accountId: 'bm-card-account', conversionRequired: false });
  });
});
```

(If `Account`/`Card` in `@kippa/domain` carry additional required fields, extend the fixtures to satisfy the compiler rather than casting.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend/functions run test`
Expected: FAIL — module `./suggestions.js` not found.

- [ ] **Step 3: Implement**

Create `suggestions.ts`:

```ts
import type { Account, Card } from '@kippa/domain';
import type { ParsedFinancialMessage } from './parser.js';

export type Suggestions = {
  accountId?: string;
  destinationAccountId?: string;
  conversionRequired: boolean;
};

/**
 * Pure account/card suggestion logic for a parsed bank message. Firestore-free
 * so it can be unit tested; the ingestion function loads docs and delegates here.
 */
export function pickSuggestions(accounts: Account[], cards: Card[], parsed: ParsedFinancialMessage): Suggestions {
  const activeAccounts = accounts.filter((account) => account.isActive && account.currency === parsed.currency);
  const cardAccount = (hint: string | undefined, kind?: 'credit' | 'debit') => {
    const card = cards.find((candidate) => candidate.isActive
      && (!kind || candidate.kind === kind)
      && !!hint
      && candidate.last4 === hint);
    return card?.parentAccountId;
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

  let conversionRequired = false;
  if (parsed.accountKind === 'credit-card' && accountId) {
    const account = accounts.find((candidate) => candidate.id === accountId);
    conversionRequired = !!account?.isActive && account.currency !== parsed.currency;
  }

  return { accountId, destinationAccountId, conversionRequired };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend/functions run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/functions/src/domain/message-ingestion/suggestions.ts backend/functions/src/domain/message-ingestion/suggestions.test.ts
git commit -m "feat(functions): extract pure pickSuggestions for message ingestion"
```

---

### Task 6: Conversion math helper (`settledAmounts`)

**Files:**
- Create: `backend/functions/src/domain/message-ingestion/conversion.ts`
- Test: `backend/functions/src/domain/message-ingestion/conversion.test.ts`

**Interfaces:**
- Produces: `type OriginalCharge = { currency: string; amount: number; rate: number }` and `settledAmounts(pendingAmount: number, pendingCurrency: string, convertedAmount: number | null, accountCurrency: string): { amount: number; currency: string; originalCharge: OriginalCharge | null }`. Task 8 imports it from `../../domain/message-ingestion/conversion.js`.

- [ ] **Step 1: Write the failing tests**

Create `conversion.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settledAmounts } from './conversion.js';

describe('settledAmounts', () => {
  it('passes through unchanged when no conversion is supplied', () => {
    expect(settledAmounts(325, 'EGP', null, 'EGP')).toEqual({ amount: 325, currency: 'EGP', originalCharge: null });
  });

  it('settles a foreign-currency charge in the account currency and preserves the original', () => {
    expect(settledAmounts(5.8, 'USD', 290, 'EGP')).toEqual({
      amount: 290, currency: 'EGP',
      originalCharge: { currency: 'USD', amount: 5.8, rate: 290 / 5.8 },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend/functions run test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `conversion.ts`:

```ts
export type OriginalCharge = { currency: string; amount: number; rate: number };

/**
 * Resolves the amounts written to the ledger when approving an imported message.
 * With a converted amount (foreign-currency card charge), the transaction settles
 * in the account currency and the original charge is preserved with its rate.
 */
export function settledAmounts(
  pendingAmount: number,
  pendingCurrency: string,
  convertedAmount: number | null,
  accountCurrency: string,
): { amount: number; currency: string; originalCharge: OriginalCharge | null } {
  if (convertedAmount == null) {
    return { amount: pendingAmount, currency: pendingCurrency, originalCharge: null };
  }
  return {
    amount: convertedAmount,
    currency: accountCurrency,
    originalCharge: { currency: pendingCurrency, amount: pendingAmount, rate: convertedAmount / pendingAmount },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend/functions run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/functions/src/domain/message-ingestion/conversion.ts backend/functions/src/domain/message-ingestion/conversion.test.ts
git commit -m "feat(functions): settledAmounts conversion helper for imported charges"
```

---

### Task 7: Webhook body tolerance (`extractMessage` / `extractSender`)

**Files:**
- Create: `backend/functions/src/domain/message-ingestion/ingestBody.ts`
- Test: `backend/functions/src/domain/message-ingestion/ingestBody.test.ts`

**Interfaces:**
- Produces: `extractMessage(body: unknown): string | null` and `extractSender(body: unknown): string`. Task 8 wires them into `ingestFinancialMessage`.

- [ ] **Step 1: Write the failing tests**

Create `ingestBody.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractMessage, extractSender } from './ingestBody.js';

describe('extractMessage', () => {
  it('reads the canonical message field', () => {
    expect(extractMessage({ message: ' From HSBC ' })).toBe(' From HSBC ');
  });

  it('falls back through forwarder field names', () => {
    expect(extractMessage({ text: 'sms body' })).toBe('sms body');
    expect(extractMessage({ body: 'sms body' })).toBe('sms body');
    expect(extractMessage({ sms: 'sms body' })).toBe('sms body');
    expect(extractMessage({ content: 'sms body' })).toBe('sms body');
    expect(extractMessage({})).toBeNull();
    expect(extractMessage({ message: '   ' })).toBeNull();
  });

  it('accepts a raw text body', () => {
    expect(extractMessage('raw sms')).toBe('raw sms');
  });
});

describe('extractSender', () => {
  it('returns a trimmed bounded sender', () => {
    expect(extractSender({ sender: ' BankMisr ' })).toBe('BankMisr');
    expect(extractSender({})).toBe('');
    expect(extractSender('raw string body')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix backend/functions run test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `ingestBody.ts`:

```ts
const MESSAGE_KEYS = ['message', 'text', 'body', 'sms', 'content'] as const;

/**
 * Android forwarder apps post different JSON shapes (and sometimes plain-text
 * bodies). Accept the common field names so most apps work without a bridge.
 */
export function extractMessage(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() ? body : null;
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  for (const key of MESSAGE_KEYS) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function extractSender(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const value = (body as Record<string, unknown>).sender;
  return typeof value === 'string' ? value.trim().slice(0, 64) : '';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix backend/functions run test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/functions/src/domain/message-ingestion/ingestBody.ts backend/functions/src/domain/message-ingestion/ingestBody.test.ts
git commit -m "feat(functions): tolerant ingest body extraction for Android forwarders"
```

---

### Task 8: Wire the webhook + suggestion + approval changes into `messageIngestion.ts`

**Files:**
- Modify: `backend/functions/src/features/message-ingestion/messageIngestion.ts`

**Interfaces:**
- Consumes: `pickSuggestions` (Task 5), `settledAmounts` (Task 6), `extractMessage`/`extractSender` (Task 7), domain types (Task 1).
- Produces: webhook accepts tolerant bodies; pendings carry `conversionRequired`; `approvePendingFinancialMessage` accepts `convertedAmount?: number` and writes `originalCharge`.

- [ ] **Step 1: Add imports**

At the top of `messageIngestion.ts`, after the parser import:

```ts
import { settledAmounts } from '../../domain/message-ingestion/conversion.js';
import { extractMessage, extractSender } from '../../domain/message-ingestion/ingestBody.js';
import { pickSuggestions } from '../../domain/message-ingestion/suggestions.js';
```

- [ ] **Step 2: Replace `resolveSuggestions` with a thin loader**

Delete the existing `resolveSuggestions` function (lines ~81-122) and replace with:

```ts
async function resolveSuggestions(
  householdId: string,
  parsed: ParsedFinancialMessage,
): Promise<{ accountId?: string; destinationAccountId?: string; conversionRequired: boolean }> {
  const db = getFirestore();
  const [accountsSnapshot, cardsSnapshot] = await Promise.all([
    db.collection(`households/${householdId}/accounts`).get(),
    db.collection(`households/${householdId}/cards`).get(),
  ]);
  const accounts = accountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Account);
  const cards = cardsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Card);
  return pickSuggestions(accounts, cards, parsed);
}
```

- [ ] **Step 3: Use the tolerant body extraction in `ingestFinancialMessage`**

Replace the `IngestBody` type (~line 36) with:

```ts
type IngestBody = {
  message?: unknown;
  text?: unknown;
  body?: unknown;
  sms?: unknown;
  content?: unknown;
  sender?: unknown;
  source?: unknown;
  idempotencyKey?: unknown;
  receivedAt?: unknown;
};
```

In `cleanSource` (~line 50), change the default return value from `'ios-shortcut'` to `'device'` (both occurrences).

Replace the message validation block (~lines 270-274) with:

```ts
    const message = extractMessage(request.body);
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      response.status(400).json({ error: 'invalid_message' });
      return;
    }
    const source = cleanSource((request.body as IngestBody).source);
    const sender = extractSender(request.body);
    const parsedResult = parseFinancialMessage(message, source, sender);
    const dedupeMaterial = typeof (request.body as IngestBody).idempotencyKey === 'string' && (request.body as IngestBody).idempotencyKey?.trim()
      ? ((request.body as IngestBody).idempotencyKey as string).trim().slice(0, 256)
      : message.replace(/\s+/g, ' ').trim();
```

Then update every later reference to `body.message` in the handler to `message` (three places: the two `buildMessagePreview(body.message)` calls and the merge notification body uses `parsed` — search for `body.message` and replace all).

In `parser.ts`, widen the signature and provider detection:

```ts
export function parseFinancialMessage(raw: string, source = 'sms', senderHint = ''): ParseResult {
```

```ts
  const provider = /HSBC/i.test(text) || /hsbc/i.test(senderHint)
    ? 'hsbc'
    : /misr/i.test(senderHint) ? 'bank-misr' : source.toLowerCase();
```

- [ ] **Step 4: Set `conversionRequired` on created pendings**

In the normal/half-pending creation block (~line 336), change:

```ts
    const suggestions = await resolveSuggestions(credential.householdId, parsedResult.parsed);
```

stays, and add to the `pending` object literal (after `suggestedLoanInstallmentNumber`, ~line 443):

```ts
      conversionRequired: suggestions.conversionRequired || null,
```

- [ ] **Step 5: Approval changes**

In `approvePendingFinancialMessage`:

5a. Extend the data cast (~line 487) with `convertedAmount?: unknown;` and parse it after the other fields:

```ts
  const convertedAmountRaw = (request.data as { convertedAmount?: unknown }).convertedAmount;
  const convertedAmount = typeof convertedAmountRaw === 'number' && Number.isFinite(convertedAmountRaw) && convertedAmountRaw > 0
    ? convertedAmountRaw
    : null;
```

5b. Inside the `runTransaction` block, after the account snapshot reads, add the conversion guards before the existing currency check, and relax the currency check for conversion-required pendings (~lines 566-568 become):

```ts
    const conversionRequired = !!pending.conversionRequired;
    if (conversionRequired) {
      if (convertedAmount == null) {
        throw new HttpsError('invalid-argument', 'Enter the amount in the card account currency to approve this charge.');
      }
      if (pending.suggestedAccountId && accountId !== pending.suggestedAccountId) {
        throw new HttpsError('failed-precondition', 'Foreign-currency card charges must be approved against the linked card account.');
      }
    }
    if (!account?.isActive || (!conversionRequired && account.currency !== pending.currency)) {
      throw new HttpsError('failed-precondition', 'Choose an active account in the message currency.');
    }
```

5c. Compute settled amounts before the writes (~line 587):

```ts
    const settled = settledAmounts(pending.amount, pending.currency, conversionRequired ? convertedAmount : null, account!.currency);
```

5d. Use `settled` everywhere amounts are written. The transaction create becomes:

```ts
    transaction.create(transactionRef, {
      id: transactionId,
      householdId,
      type: pending.kind,
      date: pending.date,
      description: pending.description,
      categoryId: categoryId || null,
      budgetCycleId: activeCycleId,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      status: 'posted',
      loanId: isLoanPayment ? suggestedLoanId : null,
      loanInstallmentNumber: isLoanPayment ? suggestedInstallment : null,
      originalCharge: settled.originalCharge,
      importedFrom: { kind: 'financial-message', pendingId, provider: pending.provider, source: pending.source },
    });
```

The source ledger line becomes:

```ts
    transaction.create(db.doc(`households/${householdId}/ledgerLines/${transactionId}_source`), {
      id: `${transactionId}_source`, householdId, transactionId, accountId,
      signedAmount: pending.kind === 'income' ? settled.amount : -settled.amount,
      currency: settled.currency, createdAt: now,
    });
```

(The transfer destination line and `conversionDetails` keep using `destAmount`/`destCurrency` — conversion never applies to transfers since `convertedAmount` is only supplied for card charges.) In the audit-log summary, replace the plain `pending.amount} ${pending.currency}` interpolation with `settled.amount} ${settled.currency}` and, when `settled.originalCharge` is present, append `(from ${pending.amount} ${pending.currency})`:

```ts
      summary: isLoanPayment
        ? `${profile.displayName || 'User'} approved imported loan installment ${suggestedInstallment}/${loan?.totalInstallments}: ${settled.amount} ${settled.currency}`
        : settled.originalCharge
        ? `${profile.displayName || 'User'} approved imported ${pending.kind}: ${settled.amount} ${settled.currency} (from ${pending.amount} ${pending.currency}) - ${pending.description}`
        : isCrossCurrency
        ? `${profile.displayName || 'User'} approved imported transfer: ${pending.amount} ${pending.currency} → ${destAmount} ${destCurrency} - ${pending.description}`
        : `${profile.displayName || 'User'} approved imported ${pending.kind}: ${pending.amount} ${pending.currency} - ${pending.description}`,
```

- [ ] **Step 6: Build and run the full functions suite**

Run: `npm --prefix backend/functions run build && npm --prefix backend/functions run test`
Expected: build clean, all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/functions/src/features/message-ingestion/messageIngestion.ts backend/functions/src/domain/message-ingestion/parser.ts
git commit -m "feat(functions): Android-tolerant webhook, bank destination suggestions, EGP conversion approval"
```

---

### Task 9: Frontend — conversion approval flow

**Files:**
- Modify: `frontend/web/src/libs/messageIngestion.ts`
- Modify: `frontend/web/src/features/pending-transactions/hooks/usePendingReviewState.ts`
- Modify: `frontend/web/src/features/pending-transactions/PendingTransactions.tsx`
- Modify: `frontend/web/src/features/pending-transactions/components/PendingReviewDialog.tsx`
- Test: `frontend/web/src/features/pending-transactions/components/PendingReviewDialog.test.tsx`

**Interfaces:**
- Consumes: `PendingFinancialMessage.conversionRequired` (Task 1); the approve callable now accepts `convertedAmount?: number` (Task 8).
- Produces: `usePendingReviewState` exposes `convertedAmount: string` + `setConvertedAmount`; `PendingReviewDialog` props gain `convertedAmount: string; onConvertedAmountChange: (value: string) => void;`.

- [ ] **Step 1: Write the failing dialog test**

Append to `PendingReviewDialog.test.tsx`:

```tsx
const usdItem: PendingFinancialMessage = {
  ...item,
  id: 'pending-usd',
  amount: 5.8,
  currency: 'USD',
  description: 'OPENROUTER, INC',
  conversionRequired: true,
};

it('requires a converted amount before approving a foreign-currency card charge', async () => {
  const user = userEvent.setup();
  const onConvertedAmountChange = vi.fn();

  render(
    <PrivacyModeProvider>
      <PendingReviewDialog
        accountId={creditAccount.id}
        accounts={[creditAccount]}
        busy={false}
        categories={[category]}
        categoryId={category.id}
        confirmDiscard={false}
        convertedAmount=""
        destinationAccountId=""
        destinationAccounts={[]}
        item={usdItem}
        onAccountChange={vi.fn()}
        onApprove={vi.fn()}
        onCategoryChange={vi.fn()}
        onClose={vi.fn()}
        onConvertedAmountChange={onConvertedAmountChange}
        onDestinationChange={vi.fn()}
        onDiscard={vi.fn()}
        state="idle"
      />
    </PrivacyModeProvider>,
  );

  const approveButton = screen.getByRole('button', { name: 'Approve' });
  expect(approveButton).toBeDisabled();

  await user.type(screen.getByLabelText('Amount in EGP'), '290');

  expect(onConvertedAmountChange).toHaveBeenCalled();
  expect(approveButton).toBeEnabled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=kippa-app -- PendingReviewDialog`
Expected: FAIL — unknown props / no such label.

- [ ] **Step 3: Implement the state hook**

In `usePendingReviewState.ts`, add `convertedAmount` to `State`, `initial`, and the returned setters:

```ts
type State = { accountId: string; categoryId: string; confirmDiscard: boolean; convertedAmount: string; destinationAccountId: string; selected: PendingFinancialMessage | null };
const initial: State = { accountId: '', categoryId: '', confirmDiscard: false, convertedAmount: '', destinationAccountId: '', selected: null };
```

and append `setConvertedAmount: setter('convertedAmount')` to the returned object.

- [ ] **Step 4: Implement the dialog**

In `PendingReviewDialog.tsx`:

4a. Add `TextField` to the MUI import list.

4b. Extend `Props` and destructure:

```ts
type Props = { /* existing props */ convertedAmount: string; onConvertedAmountChange: (value: string) => void; };
```

4c. After the existing derived flags (~line 14), add:

```ts
  const conversionRequired = !!item.conversionRequired;
  const targetCurrency = accounts.find((account) => account.id === accountId)?.currency ?? item.currency;
```

and extend `canApprove`:

```ts
  const canApprove = (transfer ? !halfPending && !!accountId && !!destinationAccountId : !!accountId && (loanPayment || !!categoryId))
    && (!conversionRequired || Number(convertedAmount) > 0);
```

4d. Add the conversion field inside the form `Stack` (after the account `FormControl`, before the transfer destination select):

```tsx
            {conversionRequired && (
              <TextField
                fullWidth
                label={`Amount in ${targetCurrency}`}
                value={convertedAmount}
                onChange={(event) => onConvertedAmountChange(event.target.value)}
                inputProps={{ inputMode: 'decimal', type: 'number' }}
                helperText={Number(convertedAmount) > 0 && item.amount > 0
                  ? `1 ${item.currency} ≈ ${(Number(convertedAmount) / item.amount).toFixed(3)} ${targetCurrency}`
                  : `Enter what the bank billed in ${targetCurrency}`}
              />
            )}
```

- [ ] **Step 5: Wire the screen**

In `PendingTransactions.tsx`:

5a. Destructure `convertedAmount, setConvertedAmount` from `usePendingReviewState()` (line 75).

5b. Replace `availableAccounts` (lines 90-93):

```ts
  const availableAccounts = useMemo(() => {
    if (!selected) return [];
    return accounts.filter((account) => account.isActive
      && (selected.conversionRequired ? account.id === selected.suggestedAccountId : account.currency === selected.currency));
  }, [accounts, selected]);
```

5c. In `openReview`, add `setConvertedAmount('');` next to the other resets.

5d. Extend the guard and payload of `approve` (lines 117, 126-132):

```ts
    if (!selected || !accountId
      || (selected.kind !== 'transfer' && !selected.suggestedLoanId && !categoryId)
      || (selected.kind === 'transfer' && !destinationAccountId)
      || (selected.conversionRequired && !(Number(convertedAmount) > 0))) return;
```

```ts
        convertedAmount: selected.conversionRequired ? Number(convertedAmount) : undefined,
```

5e. Update the connection-banner copy (lines 228-231): `iPhone message connection` → `Bank message connection`, and the subtitle to `Connect your bank's SMS automation securely`.

5f. Pass the new props to `PendingReviewDialog` (line 351): `convertedAmount={convertedAmount}` and `onConvertedAmountChange={setConvertedAmount}`.

- [ ] **Step 6: Update the lib client**

In `frontend/web/src/libs/messageIngestion.ts`:

```ts
  async approve(data: {
    householdId: string;
    pendingId: string;
    categoryId?: string;
    accountId: string;
    destinationAccountId?: string;
    convertedAmount?: number;
  }): Promise<string> {
```

and change the credential label (line 61):

```ts
    return (await callable({ householdId, label: 'SMS forwarder' })).data;
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm run test --workspace=kippa-app -- PendingReviewDialog && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/web/src/libs/messageIngestion.ts frontend/web/src/features/pending-transactions
git commit -m "feat(web): EGP conversion step for foreign-currency card charge approval"
```

---

### Task 10: Docs + deploy + live verification

**Files:**
- Modify: `docs/docs/notifications.md`

**Interfaces:**
- Consumes: everything deployed by Tasks 1-9.

- [ ] **Step 1: Document the contract**

Append a "Bank SMS ingestion" section to `docs/docs/notifications.md`:

```markdown
## Bank SMS ingestion

`ingestFinancialMessage` accepts forwarded SMS from any device:

- `POST https://<region>-<project>.cloudfunctions.net/ingestFinancialMessage`
- Header: `Authorization: Bearer <credentialId>.<secret>` (create in *Pending → Connect*)
- Body: JSON `{"text": "<sms>", "sender": "BankMisr"}` — also accepts `message`/`body`/`sms`/`content` field names, form-encoded, or a raw text body. Optional: `source`, `idempotencyKey`, `receivedAt`.

Supported message matrix: HSBC (purchases, ATM, phone-banking transfers, IPN, card payments, statements-ignored) and Bank Misr (instant transfers in/out, credit-card charges EGP+USD, ATM withdrawals, cash deposits, card payments, login alerts-ignored). USD card charges require the EGP amount at approval; the original and rate are stored on the transaction.

Android setup: use any SMS-forwarder app (e.g. Transponder, SMS Forwarder, MacroDroid). Create a rule for senders `BankMisr` and `HSBC` that POSTs `{"text": "%text%", "sender": "%sender%"}` with the Bearer header to the endpoint above.
```

- [ ] **Step 2: Run the full verification suite**

Run: `npm run functions:test && npm run test --workspace=kippa-app && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 3: Deploy functions**

Run: `FUNCTIONS_DISCOVERY_TIMEOUT=120 npm run deploy:functions`
Expected: deploy complete, `ingestFinancialMessage` among updated functions.

- [ ] **Step 4: Deploy web**

Run: `npm run deploy:web`
Expected: hosting release complete.

- [ ] **Step 5: Live end-to-end check**

1. In the app (https://kippa-1787921674.web.app) → *Pending* → **Connect** → create a credential; copy the displayed token and endpoint.
2. Verify a Bank Misr instant transfer (expect a pending expense with the account suggested):

```bash
curl -s -X POST "https://us-central1-kippa-1787921674.cloudfunctions.net/ingestFinancialMessage" \
  -H "Authorization: Bearer <TOKEN_FROM_DIALOG>" \
  -H "Content-Type: application/json" \
  -d '{"text":"تم تحويل مبلغ 1500EGP      من حساب رقم xxx7391       فى 30-AUG-2026  عن طريق التحويل اللحظي","sender":"BankMisr"}'
```

Expected: `{"accepted":true,"pendingId":"…","kind":"expense"}` and a pending item in the UI.

3. Verify a USD card charge converts at approval:

```bash
curl -s -X POST "https://us-central1-kippa-1787921674.cloudfunctions.net/ingestFinancialMessage" \
  -H "Authorization: Bearer <TOKEN_FROM_DIALOG>" \
  -H "Content-Type: application/json" \
  -d '{"text":"عميلناالعزيز،شكرًا لاستخدامكم بطاقة بنك مصر الائتمانية*2508 تم خصم مبلغ USD 5.8 فيOPENROUTER, INC        NEبتاريخ 28/08/2026،الرصيدالمتاحEGP 256400.94،وحدالاستخدام الدولي المتاحEGP148404.96للمزيداتصل 19888","sender":"BankMisr"}'
```

Expected: `{"accepted":true,…,"kind":"expense"}`; in the UI the review dialog shows the USD original, requires an EGP amount, and approving creates an EGP transaction.

4. Verify a login alert is ignored (repeat with a `تم تسجيل الدخول…` message): expect `{"accepted":false,"ignored":true,…}`.

- [ ] **Step 6: Commit docs**

```bash
git add docs/docs/notifications.md
git commit -m "docs: bank SMS ingestion contract and Android setup"
```
