import { describe, expect, it } from 'vitest';
import { getCredentialDeletionStatus } from './deleteCredential.js';

const credential = { ownerUid: 'owner-1', householdId: 'household-1', enabled: false };

describe('getCredentialDeletionStatus', () => {
  it('allows the owner to delete a disabled credential', () => {
    expect(getCredentialDeletionStatus(credential, 'owner-1', 'household-1')).toBe('allowed');
  });

  it('hides missing, other-owner, and other-household credentials', () => {
    expect(getCredentialDeletionStatus(undefined, 'owner-1', 'household-1')).toBe('not-found');
    expect(getCredentialDeletionStatus(credential, 'other-user', 'household-1')).toBe('not-found');
    expect(getCredentialDeletionStatus(credential, 'owner-1', 'other-household')).toBe('not-found');
  });

  it('rejects an enabled credential until it is revoked', () => {
    expect(getCredentialDeletionStatus({ ...credential, enabled: true }, 'owner-1', 'household-1')).toBe('active');
  });
});
