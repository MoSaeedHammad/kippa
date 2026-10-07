import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyModeProvider } from '@/hooks/PrivacyModeProvider';
import { expect, it, vi } from 'vitest';

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ householdId: 'h', userProfile: { uid: 'u', displayName: 'User' } }),
}));
vi.mock('@/libs/messageIngestion', () => ({
  messageIngestionLib: {
    decideBatch: vi.fn(),
    importHistory: vi.fn(),
  },
}));

import { MessageImport } from './MessageImport';

const PASTED = '[01/06/26, 14:05] HSBC: From HSBC: 01JUN26 Purchase from STORE EGP 325.00-';

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PrivacyModeProvider>
          <MessageImport />
        </PrivacyModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('scans pasted messages and previews count and duration', async () => {
  const user = userEvent.setup();
  renderScreen();

  fireEvent.change(screen.getByLabelText('Or paste messages'), { target: { value: PASTED } });
  await user.click(screen.getByRole('button', { name: 'Scan messages' }));

  expect(await screen.findByText('1 message found')).toBeInTheDocument();
  expect(screen.getByText('2026-06-01 → 2026-06-01')).toBeInTheDocument();
  expect(screen.getByText("Narrow the range if you don't want everything — 1 message falls inside.")).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import 1 message' })).toBeEnabled();
});

it('rejects scanning when nothing was provided', async () => {
  const user = userEvent.setup();
  renderScreen();

  await user.click(screen.getByRole('button', { name: 'Scan messages' }));

  expect(await screen.findByText('Choose a file or paste some messages first.')).toBeInTheDocument();
});
