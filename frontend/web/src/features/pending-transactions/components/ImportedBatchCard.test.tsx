import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { PrivacyModeProvider } from '@/hooks/PrivacyModeProvider';
import { expect, it, vi } from 'vitest';
import type { PendingFinancialMessage } from '@kippa/domain';

const { decideBatch } = vi.hoisted(() => ({
  decideBatch: vi.fn(async () => ({
    action: 'approve' as 'approve' | 'discard',
    approved: 2,
    discarded: 0,
    skipped: [] as { pendingId: string; reason: string }[],
    nextCursor: null as string | null,
    hasMore: false,
  })),
}));

vi.mock('@/libs/messageIngestion', () => ({
  messageIngestionLib: {
    decideBatch,
    importHistory: vi.fn(),
    getPending: vi.fn(),
    approve: vi.fn(),
    discard: vi.fn(),
    getResolved: vi.fn(),
    restoreDiscarded: vi.fn(),
    createCredential: vi.fn(),
    listCredentials: vi.fn(),
    revokeCredential: vi.fn(),
  },
}));

import { ImportedBatchCard } from './ImportedBatchCard';

const item = (overrides: Partial<PendingFinancialMessage>): PendingFinancialMessage => ({
  id: 'p1', householdId: 'h', receivedBy: 'u', kind: 'expense', source: 'import-xml',
  provider: 'hsbc', amount: 325, currency: 'EGP', date: '2025-06-01', description: 'FAWRY · BEANOS',
  messagePreview: 'preview', importBatchId: 'his_test0001', importedAt: '2026-10-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z', status: 'pending', ...overrides,
});

const renderCard = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PrivacyModeProvider>
        <SnackbarProvider>
        <ImportedBatchCard
          householdId="h"
          batchId="his_test0001"
          items={[
            item({ id: 'p1' }),
            item({ id: 'p2', kind: 'income', amount: 1200, date: '2025-03-14', description: 'Salary' }),
          ]}
          onOpenItem={vi.fn()}
        />
        </SnackbarProvider>
      </PrivacyModeProvider>
    </QueryClientProvider>,
  );
};

it('lists the staged batch with its date span and bulk actions', () => {
  renderCard();
  expect(screen.getByText('FAWRY · BEANOS')).toBeInTheDocument();
  expect(screen.getByText('Salary')).toBeInTheDocument();
  expect(screen.getByText('2025-03-14 → 2025-06-01')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Approve all' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel all' })).toBeEnabled();
});

it('approves the whole batch only after confirmation', async () => {
  const user = userEvent.setup();
  renderCard();

  await user.click(screen.getByRole('button', { name: 'Approve all' }));
  expect(decideBatch).not.toHaveBeenCalled();
  expect(screen.getByText('Each message will be posted with its suggested account and category. Messages that cannot be safely auto-approved stay pending for review.')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(await vi.waitFor(() => expect(decideBatch).toHaveBeenCalledOnce()));
  expect(decideBatch).toHaveBeenCalledWith({ householdId: 'h', batchId: 'his_test0001', action: 'approve', maxItems: 100 }, expect.anything());
});

it('follows the server cursor while more work remains and stops after the last window', async () => {
  decideBatch.mockClear();
  decideBatch
    .mockResolvedValueOnce({ action: 'approve', approved: 100, discarded: 0, skipped: [], nextCursor: '2026-01-01~a', hasMore: true })
    .mockResolvedValueOnce({ action: 'approve', approved: 1, discarded: 0, skipped: [], nextCursor: null, hasMore: false });
  const user = userEvent.setup();
  renderCard();

  await user.click(screen.getByRole('button', { name: 'Approve all' }));
  await user.click(screen.getByRole('button', { name: 'Confirm' }));

  await vi.waitFor(() => expect(decideBatch).toHaveBeenCalledTimes(2));
  expect(decideBatch).toHaveBeenNthCalledWith(1, { householdId: 'h', batchId: 'his_test0001', action: 'approve', maxItems: 100 }, expect.anything());
  expect(decideBatch).toHaveBeenNthCalledWith(2, { householdId: 'h', batchId: 'his_test0001', action: 'approve', maxItems: 100, cursor: '2026-01-01~a' }, expect.anything());
  await vi.waitFor(() => expect(screen.getByText('Approved 101 imported transactions')).toBeInTheDocument());
});

it('reports blocked messages with their reasons instead of failing silently', async () => {
  decideBatch.mockClear();
  decideBatch.mockResolvedValueOnce({
    action: 'approve',
    approved: 0,
    discarded: 0,
    skipped: [
      { pendingId: 'p1', reason: 'needs_account' },
      { pendingId: 'p2', reason: 'needs_conversion' },
    ],
    nextCursor: null,
    hasMore: false,
  });
  const user = userEvent.setup();
  renderCard();

  await user.click(screen.getByRole('button', { name: 'Approve all' }));
  await user.click(screen.getByRole('button', { name: 'Confirm' }));

  await vi.waitFor(() => expect(screen.getByText('Approved 0 imported transactions · 2 need manual review — they stayed in the list (1 has no suggested account, 1 needs a currency conversion)')).toBeInTheDocument());
});

it('reports a discarded-only run even when nothing could be discarded', async () => {
  decideBatch.mockClear();
  decideBatch.mockResolvedValueOnce({ action: 'discard', approved: 0, discarded: 0, skipped: [], nextCursor: null, hasMore: false });
  const user = userEvent.setup();
  renderCard();

  await user.click(screen.getByRole('button', { name: 'Cancel all' }));
  await user.click(screen.getByRole('button', { name: 'Confirm' }));

  await vi.waitFor(() => expect(screen.getByText('Discarded 0 imported messages')).toBeInTheDocument());
});
