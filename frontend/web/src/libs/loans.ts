import { z } from 'zod';
import type { FinanceTransaction, LedgerLine, Loan } from '@kippa/domain';
import { dbLib } from '@/libs/db';
import { transactionsLib } from '@/libs/transactions';
import { auditLogLib } from '@/libs/auditLog';
import { getLoanProgress, loanInstallmentDate } from '@/libs/loanCalculations';

type AuditUser = { uid: string; displayName: string; photoURL?: string };

export const loanInputSchema = z.object({
  name: z.string().trim().min(2).max(80), currency: z.string().trim().regex(/^[A-Z]{3}$/),
  originalTotal: z.number().positive().max(1_000_000_000), installmentAmount: z.number().positive().max(1_000_000_000),
  totalInstallments: z.number().int().min(1).max(600), firstPaymentDate: z.iso.date(), dueDay: z.number().int().min(1).max(31),
  openingPaidInstallments: z.number().int().min(0).max(600).default(0), openingPaidAmount: z.number().min(0).max(1_000_000_000).default(0),
  graceDay: z.number().int().min(1).max(31).nullable().optional(), paymentAccountId: z.string().min(1).max(128),
  status: z.enum(['active', 'paid', 'paused']).default('active'), notes: z.string().trim().max(500).nullable().optional(),
}).strict().refine(value => Math.abs(value.originalTotal - value.installmentAmount * value.totalInstallments) <= 1, { message: 'Total must equal the fixed installment multiplied by the number of months.' }).refine(value => value.openingPaidInstallments <= value.totalInstallments && value.openingPaidAmount <= value.originalTotal, { message: 'Opening progress cannot exceed the loan total.' });

export type LoanInput = z.input<typeof loanInputSchema>;

async function validateReferences(householdId: string, input: z.output<typeof loanInputSchema>) {
  const account = await dbLib.getDoc(householdId, 'accounts', input.paymentAccountId);
  if (!account || !account.isActive || account.currency !== input.currency) throw new Error('Choose an active payment account in the loan currency.');
}

export const loansLib = {
  async getLoans(householdId: string): Promise<Loan[]> {
    return ((await dbLib.getDocs(householdId, 'loans')) as Loan[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async createLoan(householdId: string, raw: LoanInput, auditUser?: AuditUser): Promise<string> {
    const input = loanInputSchema.parse(raw);
    await validateReferences(householdId, input);
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    const loan: Loan = { ...input, graceDay: input.graceDay ?? null, notes: input.notes ?? null, id, householdId, createdAt: now, updatedAt: now };
    await dbLib.setDoc(householdId, 'loans', id, loan);
    if (auditUser) void auditLogLib.logAction(householdId, auditUser, 'loan_created', `${auditUser.displayName} created loan: ${loan.name}`, { loanId: id });
    return id;
  },
  async updateLoan(householdId: string, loanId: string, raw: LoanInput, auditUser?: AuditUser): Promise<void> {
    const input = loanInputSchema.parse(raw); await validateReferences(householdId, input);
    const existing = await dbLib.getDoc(householdId, 'loans', loanId) as Loan | null;
    if (!existing) throw new Error('Loan not found.');
    const updated = { ...existing, ...input, graceDay: input.graceDay ?? null, notes: input.notes ?? null, updatedAt: new Date().toISOString() };
    delete updated.categoryId;
    await dbLib.setDoc(householdId, 'loans', loanId, updated);
    if (auditUser) void auditLogLib.logAction(householdId, auditUser, 'loan_updated', `${auditUser.displayName} updated loan: ${input.name}`, { loanId });
  },
  async recordPayment(householdId: string, loanId: string, input: { amount: number; date: string; budgetCycleId?: string | null }, userId: string, auditUser?: AuditUser): Promise<string> {
    const [loan, transactions, lines] = await Promise.all([dbLib.getDoc(householdId, 'loans', loanId) as Promise<Loan | null>, dbLib.getDocs(householdId, 'transactions') as Promise<FinanceTransaction[]>, dbLib.getDocs(householdId, 'ledgerLines') as Promise<LedgerLine[]>]);
    if (!loan || loan.status !== 'active') throw new Error('Active loan not found.');
    const amount = z.number().positive().max(loan.installmentAmount * 10).parse(input.amount); const date = z.iso.date().parse(input.date);
    const progress = getLoanProgress(loan, transactions, lines);
    if (progress.remainingAmount <= 0) throw new Error('This loan is already fully paid.');
    const installmentNumber = progress.nextInstallmentNumber;
    if (transactions.some(tx => tx.status === 'posted' && tx.loanId === loanId && tx.loanInstallmentNumber === installmentNumber)) throw new Error('This installment is already recorded.');
    const transactionId = await transactionsLib.createTransaction(householdId, { type: 'expense', date, description: `${loan.name} — installment ${installmentNumber}/${loan.totalInstallments}`, categoryId: null, budgetCycleId: input.budgetCycleId ?? null, createdBy: userId, loanId, loanInstallmentNumber: installmentNumber }, [{ accountId: loan.paymentAccountId, signedAmount: -Math.min(amount, progress.remainingAmount), currency: loan.currency }], undefined, auditUser);
    if (installmentNumber >= loan.totalInstallments || amount >= progress.remainingAmount) await dbLib.setDoc(householdId, 'loans', loanId, { ...loan, status: 'paid', updatedAt: new Date().toISOString() });
    if (auditUser) void auditLogLib.logAction(householdId, auditUser, 'loan_payment_recorded', `${auditUser.displayName} recorded installment ${installmentNumber} for ${loan.name}`, { loanId, transactionId, installmentNumber, scheduledDate: loanInstallmentDate(loan, installmentNumber) });
    return transactionId;
  },
};
