import { dbLib } from '@/libs/db';
import { auditLogLib } from '@/libs/auditLog';
import { detectBaseCurrency, currencySymbol } from '@/libs/currencyMeta';
import { Account, Category, FinanceTransaction, Household, Reconciliation, NotificationSettings, CurrencyCode } from '@kippa/domain';

type AuditUser = { uid: string; displayName: string; photoURL?: string };

export const ledgerLib = {
  // Accounts
  async getAccounts(householdId: string): Promise<Account[]> {
    const list = await dbLib.getDocs(householdId, 'accounts');
    return (list as Account[])
      .filter((account) => !account.isSharedBalance)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },

  async createAccount(
    householdId: string,
    account: Omit<Account, 'id' | 'householdId' | 'createdAt'>,
    auditUser?: AuditUser
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newAccount: Account = {
      ...account,
      id,
      householdId,
      createdAt: new Date().toISOString(),
    };
    await dbLib.setDoc(householdId, 'accounts', id, newAccount);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'account_created',
        `${auditUser.displayName} added account: ${newAccount.name} (${newAccount.currency})`,
        { accountId: id, name: newAccount.name, type: newAccount.type, currency: newAccount.currency }
      );
    }
    return id;
  },

  async seedDefaultAccounts(householdId: string, baseCurrency?: CurrencyCode): Promise<void> {
    const base = baseCurrency || detectBaseCurrency();
    const symbol = currencySymbol(base);
    const defaultAccounts: Omit<Account, 'id' | 'householdId' | 'createdAt'>[] = [
      { name: `${symbol} Bank`, type: 'running', currency: base, isActive: true, sortOrder: 1 },
      { name: `${symbol} Cash`, type: 'cash', currency: base, isActive: true, sortOrder: 2 },
    ];

    for (const acc of defaultAccounts) {
      await this.createAccount(householdId, acc);
    }
  },

  // Categories
  async getCategories(householdId: string): Promise<Category[]> {
    const list = await dbLib.getDocs(householdId, 'categories');
    return (list as Category[]).filter(c => c.isActive);
  },

  async createCategory(
    householdId: string,
    category: Omit<Category, 'id' | 'householdId' | 'createdAt'>,
    auditUser?: AuditUser
  ): Promise<string> {
    const id = crypto.randomUUID();
    const newCategory: Category = {
      ...category,
      id,
      householdId,
      createdAt: new Date().toISOString(),
    };
    await dbLib.setDoc(householdId, 'categories', id, newCategory);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'category_created',
        `${auditUser.displayName} created category: ${newCategory.name} (${newCategory.type})`,
        { categoryId: id, name: newCategory.name, type: newCategory.type }
      );
    }
    return id;
  },

  async updateCategory(
    householdId: string,
    categoryId: string,
    updates: Partial<Pick<Category, 'name' | 'isActive'>>,
    auditUser?: AuditUser
  ): Promise<void> {
    const list = await dbLib.getDocs(householdId, 'categories');
    const existing = (list as Category[]).find(c => c.id === categoryId);
    if (!existing) throw new Error('Category not found');
    const updated = { ...existing, ...updates };
    await dbLib.setDoc(householdId, 'categories', categoryId, updated);

    // Audit log (fire-and-forget)
    if (auditUser) {
      const action = updates.isActive === false ? 'deactivated' : 'updated';
      auditLogLib.logAction(
        householdId,
        auditUser,
        'category_updated',
        `${auditUser.displayName} ${action} category: ${updated.name}`,
        { categoryId, name: updated.name, ...updates }
      );
    }
  },

  async seedDefaultCategories(householdId: string): Promise<void> {
    const defaultCategories: Omit<Category, 'id' | 'householdId' | 'createdAt'>[] = [
      // Income
      { name: 'Salary', type: 'income', isActive: true },
      { name: 'Other Income', type: 'income', isActive: true },
      // Expense - Essential
      { name: 'Rent', type: 'expense', isActive: true },
      { name: 'Utilities', type: 'expense', isActive: true },
      { name: 'Groceries', type: 'expense', isActive: true },
      { name: 'Medical & Health', type: 'expense', isActive: true },
      { name: 'Debt Repayment', type: 'expense', isActive: true },
      // Expense - Flexible
      { name: 'Dining Out', type: 'expense', isActive: true },
      { name: 'Shopping', type: 'expense', isActive: true },
      { name: 'Entertainment', type: 'expense', isActive: true },
      { name: 'Transport & Fuel', type: 'expense', isActive: true },
      // Saving
      { name: 'General Saving', type: 'expense', isActive: true },
    ];

    for (const cat of defaultCategories) {
      await this.createCategory(householdId, cat);
    }
  },

  // Raw Lines & Transactions Fetchers
  async getLedgerLines(householdId: string, _cycleId?: string): Promise<any[]> {
    // Ledger lines don't have a budgetCycleId field — only transactions do.
    // Callers already match lines to transactions in-memory via transactionId.
    return dbLib.getDocs(householdId, 'ledgerLines');
  },

  async getTransactions(householdId: string, cycleId?: string): Promise<FinanceTransaction[]> {
    const filters = cycleId ? [{ field: 'budgetCycleId', op: '==' as const, value: cycleId }] : undefined;
    const list = await dbLib.getDocs(householdId, 'transactions', filters);
    return (list as FinanceTransaction[])
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  },

  async getHouseholdName(householdId: string): Promise<string> {
    try {
      const data = await dbLib.getDoc(householdId, 'householdInfo', 'info');
      if (data) {
        return (data as Household).name || 'My space';
      }
    } catch {
      // ignore
    }
    return 'My space';
  },

  async getHouseholdInfo(householdId: string): Promise<Household | null> {
    try {
      const data = await dbLib.getDoc(householdId, 'householdInfo', 'info');
      return data as Household | null;
    } catch {
      return null;
    }
  },

  async updateHouseholdBaseCurrency(
    householdId: string,
    baseCurrency: CurrencyCode
  ): Promise<void> {
    const info = await this.getHouseholdInfo(householdId);
    if (!info) throw new Error('Space not found');
    await dbLib.setDoc(householdId, 'householdInfo', 'info', { ...info, baseCurrency });
  },

  async ensureHouseholdExists(householdId: string, userId: string, name: string = 'My space'): Promise<string> {
    try {
      const data = await dbLib.getDoc(householdId, 'householdInfo', 'info');
      if (!data) {
        const now = new Date().toISOString();
        const household: Household = {
          id: householdId,
          name,
          baseCurrency: detectBaseCurrency(),
          createdAt: now,
          createdBy: userId,
        };
        await dbLib.setDoc(householdId, 'householdInfo', 'info', household);
        return name;
      }
      return (data as Household).name || name;
    } catch {
      return name;
    }
  },

  // Accounts CRUD support
  async updateAccount(
    householdId: string,
    accountId: string,
    updated: Account,
    auditUser?: AuditUser
  ): Promise<void> {
    await dbLib.setDoc(householdId, 'accounts', accountId, updated);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'account_updated',
        `${auditUser.displayName} updated account: ${updated.name}`,
        { accountId, name: updated.name, type: updated.type, currency: updated.currency }
      );
    }
  },

  // Reconciliations
  async getReconciliations(householdId: string): Promise<Reconciliation[]> {
    const list = await dbLib.getDocs(householdId, 'reconciliations');
    return list as Reconciliation[];
  },

  async createReconciliation(
    householdId: string,
    reconId: string,
    reconLog: Reconciliation,
    auditUser?: AuditUser
  ): Promise<void> {
    await dbLib.setDoc(householdId, 'reconciliations', reconId, reconLog);

    // Audit log (fire-and-forget)
    if (auditUser) {
      const diff = Number(Math.abs(reconLog.difference).toFixed(2));
      const cleanDifference = Number(reconLog.difference.toFixed(2));
      const verdict = cleanDifference === 0 ? 'matched' : `had a ${cleanDifference > 0 ? 'surplus' : 'shortfall'} of ${diff} ${reconLog.currency}`;
      auditLogLib.logAction(
        householdId,
        auditUser,
        'reconciliation_created',
        `${auditUser.displayName} reconciled an account (${verdict})`,
        { reconciliationId: reconId, accountId: reconLog.accountId, difference: cleanDifference, currency: reconLog.currency }
      );
    }
  },

  // Notification Settings
  async getNotificationSettings(householdId: string, userId: string): Promise<NotificationSettings | null> {
    const data = await dbLib.getDoc(householdId, 'notificationSettings', userId);
    return data as NotificationSettings | null;
  },

  async updateNotificationSettings(
    householdId: string,
    userId: string,
    settings: NotificationSettings,
    auditUser?: AuditUser
  ): Promise<void> {
    await dbLib.setDoc(householdId, 'notificationSettings', userId, settings);

    // Audit log (fire-and-forget)
    if (auditUser) {
      auditLogLib.logAction(
        householdId,
        auditUser,
        'notification_settings_updated',
        `${auditUser.displayName} updated reminder & alert settings`,
        { userId }
      );
    }
  }
};
