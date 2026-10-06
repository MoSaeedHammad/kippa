export type CredentialDeletionStatus = 'allowed' | 'not-found' | 'active';

export type DeletableCredential = {
  ownerUid: string;
  householdId: string;
  enabled: boolean;
};

export function getCredentialDeletionStatus(
  credential: DeletableCredential | undefined,
  uid: string,
  householdId: string,
): CredentialDeletionStatus {
  if (!credential || credential.ownerUid !== uid || credential.householdId !== householdId) return 'not-found';
  return credential.enabled === false ? 'allowed' : 'active';
}
