import type { BudgetCycle, FinanceTransaction, LedgerLine, TransactionType } from '@kippa/domain';
import { getPostedLedgerLines } from './financeCalculations';

export type CardCharge = { lineId: string; txId: string; date: string; description: string | null; amount: number; baseAmount?: number; feeRate?: number; paid: boolean; txType: TransactionType; categoryId: string | null; budgetCycleId: string | null };
export type CardChargeGroup = { groupId: string; cycleName: string; cycleDateRange: string; startDate: string; charges: CardCharge[] };

function formatDateRange(startDate: string, endDate?: string | null) {
  const format = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${format(startDate)} – ${endDate ? format(endDate) : 'Present'}`;
}

export function calculateCardActivity(accountId: string, transactions: FinanceTransaction[], lines: LedgerLine[], cycles: BudgetCycle[]) {
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const accountLines = getPostedLedgerLines(transactions, lines)
    .filter((line) => line.accountId === accountId)
    .sort((a, b) => (transactionById.get(b.transactionId)?.date ?? '').localeCompare(transactionById.get(a.transactionId)?.date ?? ''));
  const chargeIds = new Set(accountLines.filter((line) => line.signedAmount < 0).map((line) => line.transactionId));
  const explicitlySettled = new Set<string>();
  const remainingByCycle = new Map<string, number>();

  accountLines.filter((line) => line.signedAmount > 0).forEach((line) => {
    const transaction = transactionById.get(line.transactionId);
    if (transaction?.settlesChargeIds?.length) {
      transaction.settlesChargeIds.filter((id) => chargeIds.has(id)).forEach((id) => explicitlySettled.add(id));
    } else {
      const cycleId = transaction?.budgetCycleId ?? 'uncategorized';
      remainingByCycle.set(cycleId, (remainingByCycle.get(cycleId) ?? 0) + line.signedAmount);
    }
  });

  const charges = accountLines.flatMap<CardCharge>((line) => {
    const transaction = transactionById.get(line.transactionId);
    if (!transaction || line.signedAmount >= 0) return [];
    const cycleId = transaction.budgetCycleId ?? 'uncategorized';
    const amount = Math.abs(line.signedAmount);
    let paid = explicitlySettled.has(transaction.id);
    if (!paid && (remainingByCycle.get(cycleId) ?? 0) >= amount) {
      paid = true;
      remainingByCycle.set(cycleId, (remainingByCycle.get(cycleId) ?? 0) - amount);
    }
    return [{ lineId: line.id, txId: transaction.id, date: transaction.date, description: transaction.description ?? null, amount, baseAmount: line.cardFee?.baseAmount ?? amount, feeRate: line.cardFee?.rate ?? 0, paid, txType: transaction.type, categoryId: transaction.categoryId ?? null, budgetCycleId: transaction.budgetCycleId ?? null }];
  });

  const groups = new Map<string, CardChargeGroup>();
  charges.forEach((charge) => {
    const cycle = cycles.find((candidate) => candidate.id === charge.budgetCycleId);
    const groupId = cycle?.id ?? 'uncategorized';
    if (!groups.has(groupId)) groups.set(groupId, { groupId, cycleName: cycle?.name ?? 'Uncategorized', cycleDateRange: cycle ? formatDateRange(cycle.startDate, cycle.endDate) : '', startDate: cycle?.startDate ?? '0000-00-00', charges: [] });
    groups.get(groupId)!.charges.push(charge);
  });
  const cycleGroups = [...groups.values()].sort((a, b) => a.groupId === 'uncategorized' ? 1 : b.groupId === 'uncategorized' ? -1 : b.startDate.localeCompare(a.startDate));
  const unpaidCharges = charges.filter((charge) => !charge.paid);
  return { accountBalance: accountLines.reduce((total, line) => total + line.signedAmount, 0), charges, cycleGroups, totalDebt: unpaidCharges.reduce((total, charge) => total + charge.amount, 0) };
}
