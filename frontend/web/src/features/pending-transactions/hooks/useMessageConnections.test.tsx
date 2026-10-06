import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageIngestionCredential } from '@kippa/domain';

const mocks = vi.hoisted(() => ({
  listCredentials: vi.fn(),
  deleteCredential: vi.fn(),
  revokeCredential: vi.fn(),
  createCredential: vi.fn(),
  enqueueSnackbar: vi.fn(),
}));

vi.mock('@/libs/messageIngestion', () => ({ messageIngestionLib: mocks }));
vi.mock('notistack', () => ({ useSnackbar: () => ({ enqueueSnackbar: mocks.enqueueSnackbar }) }));

import { useMessageConnections } from './useMessageConnections';

const credential = (overrides: Partial<MessageIngestionCredential> = {}): MessageIngestionCredential => ({
  id: 'credential-1', label: 'Secure connection', enabled: true, createdAt: '2026-01-01', ...overrides,
});

describe('useMessageConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCredentials.mockResolvedValue([credential()]);
    mocks.deleteCredential.mockResolvedValue(undefined);
    mocks.revokeCredential.mockResolvedValue(undefined);
  });

  it('loads credentials, deletes a disabled connection, and refreshes the list', async () => {
    mocks.listCredentials.mockResolvedValueOnce([credential({ enabled: false })]).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useMessageConnections('household'));
    await waitFor(() => expect(result.current.credentials).toHaveLength(1));
    await act(async () => { await result.current.remove('credential-1'); });
    expect(mocks.deleteCredential).toHaveBeenCalledWith('credential-1');
    await waitFor(() => expect(result.current.credentials).toEqual([]));
    expect(mocks.enqueueSnackbar).toHaveBeenCalledWith('Connection deleted', { variant: 'success' });
  });

  it('revokes active connections and preserves the row as disabled', async () => {
    mocks.listCredentials.mockResolvedValueOnce([credential()]).mockResolvedValueOnce([credential({ enabled: false })]);
    const { result } = renderHook(() => useMessageConnections('household'));
    await waitFor(() => expect(result.current.credentials).toHaveLength(1));
    await act(async () => { await result.current.revoke('credential-1'); });
    expect(mocks.revokeCredential).toHaveBeenCalledWith('credential-1');
    expect(result.current.credentials[0].enabled).toBe(false);
  });

  it('preserves credentials and reports failures', async () => {
    mocks.deleteCredential.mockRejectedValueOnce(new Error('delete failed'));
    const { result } = renderHook(() => useMessageConnections('household'));
    await waitFor(() => expect(result.current.credentials).toHaveLength(1));
    await act(async () => { await result.current.remove('credential-1'); });
    expect(result.current.credentials).toEqual([credential()]);
    expect(mocks.enqueueSnackbar).toHaveBeenCalledWith('delete failed', { variant: 'error' });
  });

  it('clears a generated token when its connection is deleted', async () => {
    mocks.createCredential.mockResolvedValue({ credentialId: 'credential-1', token: 'secret', endpoint: '/messages' });
    mocks.listCredentials.mockResolvedValue([credential()]);
    const { result } = renderHook(() => useMessageConnections('household'));
    await waitFor(() => expect(result.current.credentials).toHaveLength(1));
    await act(async () => { await result.current.create(); });
    expect(result.current.generated).toMatchObject({ credentialId: 'credential-1', token: 'secret' });
    await act(async () => { await result.current.remove('credential-1'); });
    expect(result.current.generated).toBeNull();
  });
});
