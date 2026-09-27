import { dbLib } from '@/libs/db';
import { auditLogLib } from '@/libs/auditLog';
import { BudgetCycle, BudgetAllocation, ExpectedIncome } from '@kippa/domain';
import { allocationDocId, dedupeAllocations } from '@/libs/allocations';

type AuditUser = { uid: string; displayName: string; photoURL?: string };

export const cyclesLib = {
  async getCycles(householdId: string): Promise<BudgetCycle[]> {
    const list = await dbLib.getDocs(householdId, 'budgetCycles');
    return (list as BudgetCycle[]).sort((a, b) => b.startDate.localeCompare(a.startDate));
  },

  async getActiveCycle(householdId: string): Promise<BudgetCycle | null> {
    const cycles = await this.getCycles(householdId);
    return cycles.find(c => c.status === 'open') || null;
  },

  async createCycle(
    householdId: string,
    cycle: Omit<BudgetCycle, 'id' | 'householdId'>,
    auditUser?: AuditUser
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newCycle: BudgetCycle = {
      ...cycle,
      id,
      householdId,
    };
    await dbLib.setDoc(householdId, 'budgetCycles', id, newCycle);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'cycle_created',
        `${auditUser.displayName} created cycle: ${newCycle.name}`,
        { cycleId: id, name: newCycle.name, startDate: newCycle.startDate, status: newCycle.status }
      );
    }
    return id;
  },

  async updateCycleStatus(
    householdId: string,
    cycleId: string,
    status: 'planned' | 'open' | 'closed',
    extra: Partial<BudgetCycle> = {},
    auditUser?: AuditUser
  ): Promise<void> {
    const cycle = await dbLib.getDoc(householdId, 'budgetCycles', cycleId) as BudgetCycle | null;
    if (!cycle) throw new Error('Statement not found');

    const updated: BudgetCycle = {
      ...cycle,
      ...extra,
      status,
    };
    await dbLib.setDoc(householdId, 'budgetCycles', cycleId, updated);

    // Audit log (fire-and-forget)
    if (auditUser) {
      const verb = status === 'open' ? 'opened' : status === 'closed' ? 'closed' : 'set to planned';
      auditLogLib.logAction(
        householdId,
        auditUser,
        'cycle_status_changed',
        `${auditUser.displayName} ${verb} cycle: ${updated.name}`,
        { cycleId, name: updated.name, status }
      );
    }
  },

  // Allocations
  async getBudgetAllocations(householdId: string, cycleId: string): Promise<BudgetAllocation[]> {
    const allAllocations = await dbLib.getDocs(householdId, 'budgetAllocations');
    const filtered = (allAllocations as BudgetAllocation[]).filter(a => a.budgetCycleId === cycleId);
    // Defensive: stale duplicate allocation docs (from before the canonical-id
    // write fix) would otherwise render as duplicate category rows. Collapse
    // to one doc per (cycle, category).
    return dedupeAllocations(filtered);
  },

  async saveBudgetAllocation(
    householdId: string,
    allocation: Omit<BudgetAllocation, 'id' | 'householdId'>,
    auditUser?: AuditUser
  ): Promise<string> {
    // Canonical id keyed on (cycle, category) so re-saving upserts the same doc
    // instead of creating duplicates.
    const id = allocationDocId(allocation.budgetCycleId, allocation.categoryId);
    const newAlloc: BudgetAllocation = {
      ...allocation,
      id,
      householdId,
    };
    await dbLib.setDoc(householdId, 'budgetAllocations', id, newAlloc);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'allocation_saved',
        `${auditUser.displayName} saved a budget allocation of ${newAlloc.plannedAmount} ${newAlloc.currency}`,
        { allocationId: id, categoryId: newAlloc.categoryId, cycleId: newAlloc.budgetCycleId, plannedAmount: newAlloc.plannedAmount, currency: newAlloc.currency }
      );
    }
    return id;
  },

  async saveBudgetAllocationsBatch(
    householdId: string,
    allocations: Omit<BudgetAllocation, 'id' | 'householdId'>[],
    auditUser?: AuditUser
  ): Promise<void> {
    const ops = allocations.map(a => {
      // Canonical id keyed on (cycle, category) so re-saving upserts the same
      // doc instead of creating duplicates.
      const id = allocationDocId(a.budgetCycleId, a.categoryId);
      return {
        type: 'set' as const,
        collectionName: 'budgetAllocations',
        docId: id,
        data: {
          ...a,
          id,
          householdId,
        },
      };
    });
    await dbLib.executeBatch(householdId, ops);

    // Audit log (fire-and-forget)
    if (auditUser && allocations.length > 0) {
      const cycleId = allocations[0].budgetCycleId;
      auditLogLib.logAction(
        householdId,
        auditUser,
        'allocations_batch_saved',
        `${auditUser.displayName} saved ${allocations.length} budget allocation${allocations.length === 1 ? '' : 's'}`,
        { cycleId, count: allocations.length }
      );
    }
  },

  // Expected Income
  async getExpectedIncomes(householdId: string, cycleId: string): Promise<ExpectedIncome[]> {
    const list = await dbLib.getDocs(householdId, 'expectedIncome');
    return (list as ExpectedIncome[]).filter(i => i.budgetCycleId === cycleId);
  },

  async saveExpectedIncome(
    householdId: string,
    income: Omit<ExpectedIncome, 'id' | 'householdId'>,
    auditUser?: AuditUser
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newInc: ExpectedIncome = {
      ...income,
      id,
      householdId,
    };
    await dbLib.setDoc(householdId, 'expectedIncome', id, newInc);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'expected_income_saved',
        `${auditUser.displayName} added expected income: ${newInc.label} (${newInc.amount} ${newInc.currency})`,
        { incomeId: id, cycleId: newInc.budgetCycleId, label: newInc.label, amount: newInc.amount, currency: newInc.currency }
      );
    }
    return id;
  },

  async getAllBudgetAllocations(householdId: string): Promise<BudgetAllocation[]> {
    const list = await dbLib.getDocs(householdId, 'budgetAllocations');
    // Collapse any stale duplicate docs (see getBudgetAllocations).
    return dedupeAllocations(list as BudgetAllocation[]);
  },

  async getAllExpectedIncomes(householdId: string): Promise<ExpectedIncome[]> {
    const list = await dbLib.getDocs(householdId, 'expectedIncome');
    return list as ExpectedIncome[];
  }
};
