import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { Account, Category, PendingFinancialMessage } from '@kippa/domain';
import { PrivacyModeProvider } from '@/hooks/PrivacyModeProvider';
import { PendingReviewDialog } from './PendingReviewDialog';

const creditAccount: Account = {
  id: 'hsbc-credit-debt',
  householdId: 'household',
  name: 'HSBC Credit Card Debt',
  type: 'credit',
  currency: 'EGP',
  isActive: true,
  sortOrder: 0,
  createdAt: '2026-08-02T00:00:00.000Z',
};

const category: Category = {
  id: 'apple-music',
  householdId: 'household',
  name: 'Apple Music',
  type: 'expense',
  isActive: true,
  createdAt: '2026-08-02T00:00:00.000Z',
};

const item: PendingFinancialMessage = {
  id: 'pending-apple',
  householdId: 'household',
  receivedBy: 'user',
  kind: 'expense',
  source: 'ios-shortcut',
  provider: 'hsbc',
  amount: 109.99,
  currency: 'EGP',
  date: '2026-08-02',
  description: 'APPLE.COM/BILL',
  messagePreview: 'HSBC card purchase',
  suggestedAccountId: creditAccount.id,
  createdAt: '2026-08-02T00:00:00.000Z',
  status: 'pending',
};

it('shows the suggested account and commits a category selection', async () => {
  const user = userEvent.setup();
  const onCategoryChange = vi.fn();

  render(
    <PrivacyModeProvider>
      <PendingReviewDialog
        accountId={creditAccount.id}
        accounts={[creditAccount]}
        busy={false}
        categories={[category]}
        categoryId=""
        confirmDiscard={false}
        convertedAmount=""
        destinationAccountId=""
        destinationAccounts={[]}
        item={item}
        merchant={item.counterparty ?? ''}
        onMerchantChange={vi.fn()}
        onCreateAccount={vi.fn()}
        onCreateCategory={vi.fn()}
        onAccountChange={vi.fn()}
        onApprove={vi.fn()}
        onCategoryChange={onCategoryChange}
        onClose={vi.fn()}
        onConvertedAmountChange={vi.fn()}
        onDestinationChange={vi.fn()}
        onDiscard={vi.fn()}
        state="idle"
      />
    </PrivacyModeProvider>,
  );

  expect(screen.getByLabelText('From account')).toHaveTextContent('HSBC Credit Card Debt');

  await user.click(screen.getByLabelText('Category (optional)'));
  await user.click(screen.getByRole('option', { name: 'Apple Music' }));

  expect(onCategoryChange).toHaveBeenCalledWith(category.id);
});

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

  function Harness() {
    const [convertedAmount, setConvertedAmount] = useState('');
    return (
      <PrivacyModeProvider>
        <PendingReviewDialog
          accountId={creditAccount.id}
          accounts={[creditAccount]}
          busy={false}
          categories={[category]}
          categoryId={category.id}
          confirmDiscard={false}
          convertedAmount={convertedAmount}
          destinationAccountId=""
          destinationAccounts={[]}
          item={usdItem}
          merchant={item.counterparty ?? ''}
        onMerchantChange={vi.fn()}
        onCreateAccount={vi.fn()}
        onCreateCategory={vi.fn()}
        onAccountChange={vi.fn()}
          onApprove={vi.fn()}
          onCategoryChange={vi.fn()}
          onClose={vi.fn()}
          onConvertedAmountChange={(value) => {
            setConvertedAmount(value);
            onConvertedAmountChange(value);
          }}
          onDestinationChange={vi.fn()}
          onDiscard={vi.fn()}
          state="idle"
        />
      </PrivacyModeProvider>
    );
  }

  render(<Harness />);

  const approveButton = screen.getByRole('button', { name: 'Approve' });
  expect(approveButton).toBeDisabled();

  await user.type(screen.getByLabelText('Amount in EGP'), '290');

  expect(onConvertedAmountChange).toHaveBeenCalled();
  expect(approveButton).toBeEnabled();
});
