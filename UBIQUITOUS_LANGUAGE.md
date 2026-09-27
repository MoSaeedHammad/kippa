# Ubiquitous Language

Glossary of record for all **user-facing text** in Kippa (nav labels, pages, buttons, dialogs, notifications, docs). Internal code identifiers and Firestore paths (e.g. `householdId`, `ledgerLines`, `FinanceTransaction`) are intentionally **not** renamed — they are invisible to users.

## Shared access

| Term             | Definition                                                                 | Aliases to avoid                     |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| **Shared account** | The shared workspace holding all accounts, transactions, and settings     | Household, workspace, joint account  |
| **Member**       | A person with access to the shared account                                 | Household member, joint holder, user |
| **Owner**        | The member who created the shared account and approves join requests       | Admin                                |
| **Access level** | What a member may see in the shared account: **Full** or **Shared balance only** | Permission, role, scope       |
| **Full member**  | A member whose access level is Full; sees everything in the shared account | Admin (unqualified)                  |
| **Shared-balance member** | A member whose access level is Shared balance only; sees only the shared balance, its entries, and members | Limited member, viewer, guest |
| **Invite link**  | The link a member shares so another person can request to join; it may suggest an access level, which the owner sets at approval | Household Invite ID, invite code |
| **Join request** | A request to become a member, awaiting the owner's decision on access level | Access request                      |

## Money & accounts

| Term           | Definition                                                                      | Aliases to avoid                   |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------- |
| **Account**    | A place money is held: bank, running, savings, cash, wallet, or credit          | Ledger, book                       |
| **Card**       | A debit or credit card attached to an account                                   | —                                  |
| **Transaction**| A recorded money event: income, expense, transfer, or adjustment                | Ledger entry, record, FinanceTransaction |
| **Transfer**   | A transaction moving money between two accounts, with in and out legs           | Payment (unqualified)              |
| **Entry**      | The single signed (+in / −out) amount a transaction records on one account      | Ledger line, posting               |
| **Statement**  | One monthly period of transactions, allocations, and totals                     | Budget cycle, cycle, period        |
| **Category**   | The spending group assigned to an expense                                       | Tag, bucket                        |
| **Adjustment** | A correction transaction that sets an account's balance directly                | Fix, patch                         |
| **Reconciliation** | Comparing recorded transactions against the bank's actual statements        | Balance check, match               |

## Shared balance (between two members)

| Term              | Definition                                                                     | Aliases to avoid                    |
| ----------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| **Shared balance**| The running net amount owed between two members                                | Between-us, dues, IOU balance, P2P  |
| **IOU**           | A shared-balance entry where one member paid the full amount for the other     | Debt, charge                        |
| **Split**         | A shared-balance entry covering only one member's portion of a shared expense  | Share, division                     |
| **Repayment**     | A reversed-direction shared-balance entry that reduces what is owed            | Settlement, payback                 |
| **Type label**    | The chosen kind of a shared-balance entry: Cash, InstaPay, bank transfer, loan, shared bill, … | Type of transfer, method |
| **Counterparty**  | The member named on a shared-balance entry, whose approval it needs            | The other side, other party         |
| **Approval**      | The counterparty's confirmation that makes a shared-balance entry count toward the balance | Accept, confirm         |

## Approvals & ingestion

| Term            | Definition                                                                       | Aliases to avoid                     |
| --------------- | -------------------------------------------------------------------------------- | ------------------------------------ |
| **Approvals**   | The queue of items awaiting a decision: bank messages and shared-balance entries | Pending review, pending transactions |
| **Bank message**| An SMS notification from a bank, ingested and awaiting approval before posting   | Pending financial message, SMS item  |
| **Discard**     | Rejecting a bank message without posting it (restorable)                         | Delete, reject (for messages)        |

## Relationships

- A **Shared account** contains many **Accounts**; **Members** share everything in it.
- An **Owner** decides **Join requests** and each member's **Access level**; approved requesters become **Members**.
- A **Shared-balance member** sees only the shared balance — never accounts, transactions, or bank messages; privacy is enforced by security rules, not by hiding UI.
- Every **Transaction** writes one or more **Entries**; balances are the sum of entries.
- A **Statement** groups a month of **Transactions**.
- A **Shared balance** entry (IOU, Split, or Repayment) names exactly one **Counterparty** and counts toward the balance only after that counterparty's **Approval**; each viewer sees the sign relative to themselves.
- A Split stores only the counterparty's portion of the expense — never the payer's full amount.
- A **Bank message**, once approved, posts a **Transaction**; it may also create a linked shared-balance entry (IOU or Split) that waits for the counterparty's approval.

## Flagged ambiguities

- **"account"** informally means both the money-holding **Account** and the workspace. Distinct: the shared account *contains* accounts. In user-facing copy always write "shared account" in full for the workspace, never bare "account".
- **"transfer"** is reserved for account-to-account **Transactions**. Money owed between members is an **IOU/Split/Repayment** on the shared balance — never call those "transfers" in the UI.
- **"approval"** covers two different rules under one roof: bank messages may be approved by *any* full member; shared-balance entries must be approved by the named **Counterparty** specifically.
- **"role"** (owner/member, internal) decides who approves join requests; **access level** decides visibility. They are independent — a shared-balance member can never be the owner.

## Example dialogue

> **Dev:** "When the owner approves a **join request**, does the new **member** immediately see the **shared balance**?"
> **Domain expert:** "Yes — membership grants full visibility. But the balance only moves once their **IOU** or **Split** gets the **counterparty's approval**."
> **Dev:** "And if a **bank message** arrives showing I transferred cash to my brother?"
> **Domain expert:** "Approving the message posts the **transaction** to the right **accounts** right away. Tagging it as an IOU additionally creates a shared-balance entry that waits for *his* approval."
> **Dev:** "So the **statement** might show the transaction before the shared balance reflects it?"
> **Domain expert:** "Exactly — the account ledger and the shared balance can momentarily disagree by design."
