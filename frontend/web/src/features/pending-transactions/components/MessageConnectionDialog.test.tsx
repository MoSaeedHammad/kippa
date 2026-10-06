import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageIngestionCredential } from '@kippa/domain';
import { MessageConnectionDialog } from './MessageConnectionDialog';

const credential = (overrides: Partial<MessageIngestionCredential> = {}): MessageIngestionCredential => ({
  id: 'credential-1', label: 'Secure connection', enabled: false, createdAt: '2026-01-01', ...overrides,
});

const props = (overrides: Partial<React.ComponentProps<typeof MessageConnectionDialog>> = {}) => ({
  busy: false, credentials: [credential()], generated: null, onClose: vi.fn(), onCopy: vi.fn(), onCreate: vi.fn(), onRevoke: vi.fn(), onDelete: vi.fn(), open: true, ...overrides,
});

describe('MessageConnectionDialog', () => {
  it('deletes disabled connections and normalizes the legacy iPhone label', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<MessageConnectionDialog {...props({ credentials: [credential({ label: 'iPhone Shortcut' })], onDelete })} />);

    expect(screen.getByText('Secure message connection')).toBeInTheDocument();
    expect(screen.queryByText('iPhone Shortcut')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('credential-1');
  });

  it('offers Disable for active connections and disables actions while busy', async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();
    const onDelete = vi.fn();
    const { rerender } = render(<MessageConnectionDialog {...props({ credentials: [credential({ enabled: true })], onRevoke, onDelete })} />);
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    expect(onRevoke).toHaveBeenCalledWith('credential-1');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();

    rerender(<MessageConnectionDialog {...props({ busy: true, credentials: [credential({ enabled: true })], onRevoke, onDelete })} />);
    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });
});
