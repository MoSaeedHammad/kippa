import { vi, describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Card } from '@kippa/domain';
import { CardDetail } from './CardDetail';

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
}));

vi.mock('@/hooks/useAppContext', () => ({ useAppContext: () => ({ householdId: 'household' }) }));
vi.mock('@/hooks/useFormattedMoney', () => ({
  useFormattedMoney: () => (amount: number, code: string) => `${code} ${amount.toFixed(2)}`,
}));
vi.mock('@/hooks/usePrivacyMask', () => ({
  usePrivacyMask: () => ({ maskText: (value: string) => value, maskDigits: (value: string) => value }),
}));
vi.mock('@/hooks/useFinance', () => ({
  useTransactions: () => ({ data: [] }),
  useLedgerLines: () => ({ data: [] }),
  useCategories: () => ({ data: [] }),
  useCycles: () => ({ data: [{ id: 'cycle', status: 'open', name: 'Current', startDate: '2026-01-01' }] }),
  usePayCardMutation: () => ({ isPending: false, mutateAsync: mocks.mutateAsync }),
}));
vi.mock('@/libs/cardActivity', () => ({
  calculateCardActivity: () => ({
    accountBalance: -1029.99,
    totalDebt: 1029.99,
    charges: [{ lineId: 'line-1', txId: 'charge-1', date: '2026-01-01', description: 'ChatGPT', amount: 1029.99, baseAmount: 999.99, feeRate: 3, paid: false, txType: 'expense', categoryId: null, budgetCycleId: 'cycle' }],
    cycleGroups: [],
  }),
}));
vi.mock('./CardDesign', () => ({
  CardBackground: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BankLogo: () => <span />,
  NetworkLogo: () => <span />,
  TierLabel: () => <span />,
  CardChip: () => <span />,
  ContactlessIcon: () => <span />,
}));
vi.mock('@/components/Money', () => ({ Money: ({ amount, code }: { amount: number; code: string }) => <>{code} {amount.toFixed(2)}</> }));
vi.mock('./components/CardActivityList', () => ({
  CardActivityList: ({ onPay }: { onPay: (charge: unknown) => void }) => (
    <button onClick={() => onPay({ txId: 'charge-1', description: 'ChatGPT', txType: 'expense', amount: 1029.99, baseAmount: 999.99, feeRate: 3 })}>Pay</button>
  ),
}));

const card: Card = {
  id: 'card-1', householdId: 'household', kind: 'credit', parentAccountId: 'credit-account', name: 'HSBC',
  last4: '1234', network: 'visa', bankId: 'hsbc', isActive: true, createdAt: '2026-01-01', currency: 'EGP', creditLimit: 10000,
};

function renderCard() {
  return render(<CardDetail card={card} onClose={mocks.onClose} />);
}

function paymentInputs() {
  return {
    amount: screen.getByLabelText('Message amount (EGP)') as HTMLInputElement,
    fee: screen.getByLabelText('Bank fee (%)') as HTMLInputElement,
    confirm: screen.getByRole('button', { name: 'Confirm' }),
  };
}

describe('CardDetail credit payment dialog', () => {
  beforeEach(() => mocks.mutateAsync.mockClear());

  it('opens a charge payment with a three percent fee and updates the total as fields change', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Pay' }));

    const fields = paymentInputs();
    expect(fields.amount).toHaveValue(999.99);
    expect(fields.fee).toHaveValue(3);
    expect(screen.getByText('EGP 30.00')).toBeInTheDocument();
    expect(screen.getAllByText('EGP 1029.99').length).toBeGreaterThan(0);

    await user.clear(fields.amount);
    await user.type(fields.amount, '200');
    await user.clear(fields.fee);
    await user.type(fields.fee, '5');
    expect(screen.getByText('EGP 10.00')).toBeInTheDocument();
    expect(screen.getByText('EGP 210.00')).toBeInTheDocument();

    await user.clear(fields.fee);
    await user.type(fields.fee, '0');
    expect(screen.getByText('EGP 0.00')).toBeInTheDocument();
    expect(screen.getByText('EGP 200.00')).toBeInTheDocument();
  });

  it('disables confirmation for empty or invalid values and submits total plus fee payload', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    const fields = paymentInputs();

    await user.clear(fields.amount);
    expect(fields.confirm).toBeDisabled();
    await user.type(fields.amount, '100');
    await user.clear(fields.fee);
    await user.type(fields.fee, '101');
    expect(fields.confirm).toBeDisabled();

    await user.clear(fields.fee);
    await user.type(fields.fee, '3');
    await user.click(fields.confirm);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      amount: 103,
      fee: { amount: 3, rate: 3 },
      settlesChargeIds: ['charge-1'],
      settlesDescriptions: ['ChatGPT'],
    }));
  });

  it('uses the three percent default for Pay all and resets it when reopened', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button', { name: 'Pay all' }));
    let fields = paymentInputs();
    expect(fields.amount).toHaveValue(999.99);
    expect(fields.fee).toHaveValue(3);
    expect(screen.getAllByText('EGP 1029.99').length).toBeGreaterThan(0);
    await user.clear(fields.fee);
    await user.type(fields.fee, '0');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pay' })).toBeVisible());
    await user.click(screen.getByRole('button', { name: 'Pay' }));
    fields = paymentInputs();
    expect(fields.fee).toHaveValue(3);
  });
});
