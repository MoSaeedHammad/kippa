import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { AccessLevel, UserProfile } from '@kippa/domain';

/**
 * Access-level helpers shared by callables. The access level lives on the
 * user doc under memberships.{householdId}.accessLevel and is written only
 * by the decideJoinRequest / updateMemberAccessLevel callables. A missing
 * entry means 'full' so members created before access levels existed are
 * unaffected.
 */
/** Single source of the 'missing entry means full' default. */
export function accessLevelOf(
  profile: Pick<UserProfile, 'memberships'> | undefined | null,
  householdId: string,
): AccessLevel {
  return profile?.memberships?.[householdId]?.accessLevel ?? 'full';
}

export async function getAccessLevel(uid: string, householdId: string): Promise<AccessLevel> {
  const snapshot = await getFirestore().doc(`users/${uid}`).get();
  return accessLevelOf(snapshot.data() as Partial<UserProfile> | undefined, householdId);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getFirestore().doc(`users/${uid}`).get();
  return (snapshot.data() as UserProfile | undefined) ?? null;
}

export async function requireHouseholdMember(uid: string, householdId: string): Promise<UserProfile> {
  const profile = await getUserProfile(uid);
  const memberships = profile?.householdIds ?? (profile?.householdId ? [profile.householdId] : []);
  if (!profile || !memberships.includes(householdId)) {
    throw new HttpsError('permission-denied', 'You are not a member of this shared account.');
  }
  return profile;
}

export async function requireFullHouseholdMember(uid: string, householdId: string): Promise<UserProfile> {
  const profile = await requireHouseholdMember(uid, householdId);
  if (accessLevelOf(profile, householdId) !== 'full') {
    throw new HttpsError(
      'permission-denied',
      'Your access level does not allow this action.',
    );
  }
  return profile;
}

/** Loads a member profile, or null when the uid is not a household member. */
export async function getMemberProfileInHousehold(
  uid: string,
  householdId: string,
): Promise<UserProfile | null> {
  const profile = await getUserProfile(uid);
  const memberships = profile?.householdIds ?? (profile?.householdId ? [profile.householdId] : []);
  return profile && memberships.includes(householdId) ? profile : null;
}

/** Uids of members whose access level is full — the only recipients of spending-related pushes. */
export async function listFullMemberUids(householdId: string): Promise<string[]> {
  const membersSnap = await getFirestore()
    .collection('users')
    .where('householdIds', 'array-contains', householdId)
    .get();
  return membersSnap.docs
    .map((d) => d.data() as Partial<UserProfile>)
    .filter((p) => (p.memberships?.[householdId]?.accessLevel ?? 'full') === 'full')
    .map((p) => p.uid as string);
}
