import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type {
  UserProfile,
  Household,
  NotificationSettings,
  JoinRequest,
  JoinStatus,
  AccessLevel,
} from '@kippa/domain';
import { accessLevelOf } from '../../libs/householdAccess.js';
import { buildMessagePayload } from '../../domain/notifications/payload.js';
import { getTokensForUsers, sendToMany } from '../../libs/notifications/sendToMany.js';

function parseAccessLevel(raw: unknown): AccessLevel | null {
  return raw === 'full' || raw === 'sharedBalanceOnly' ? raw : null;
}

/**
 * Creates a new household and makes the caller the owner.
 * Replaces the client-side createHousehold — the membership write
 * must happen server-side now that rules lock users/{uid}.
 */
export const createHousehold = onCall(async (req) => {
  const db = getFirestore();
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const data = req.data as { name?: string; baseCurrency?: string };
  const name = data?.name?.trim();
  const baseCurrency = data?.baseCurrency?.trim() || 'USD';
  if (!name) {
    throw new HttpsError('invalid-argument', 'Space name is required.');
  }

  const householdId = crypto.randomUUID();
  const now = new Date().toISOString();
  const household: Household = {
    id: householdId,
    name,
    baseCurrency,
    createdAt: now,
    createdBy: uid,
  };

  const batch = db.batch();
  batch.set(db.doc(`households/${householdId}/householdInfo/info`), household);
  // Merge so we don't clobber displayName/email/createdAt/photoURL on the user
  // doc, and UNION householdIds — creating another shared account must never
  // erase membership in the existing ones. The new account becomes active.
  const userSnap = await db.doc(`users/${uid}`).get();
  const existingIds = (userSnap.data()?.householdIds as string[] | undefined) ?? [];
  batch.set(
    db.doc(`users/${uid}`),
    {
      householdId,
      householdIds: existingIds.includes(householdId) ? existingIds : [...existingIds, householdId],
      role: 'owner',
    } as Pick<UserProfile, 'householdId' | 'householdIds' | 'role'>,
    { merge: true },
  );
  await batch.commit();

  return { householdId };
});

/**
 * Request to join a household. Creates an idempotent pending joinRequest doc.
 * Does NOT touch users/{uid} — only the owner's approval can do that.
 */
export const requestToJoinHousehold = onCall(async (req) => {
  const db = getFirestore();
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const householdId = (req.data as { householdId?: string })?.householdId?.trim();
  if (!householdId) {
    throw new HttpsError('invalid-argument', 'householdId is required.');
  }

  const hhSnap = await db.doc(`households/${householdId}/householdInfo/info`).get();
  if (!hhSnap.exists) {
    throw new HttpsError('not-found', 'Space ID not found.');
  }
  const household = hhSnap.data() as Household;
  const ownerUid = household.createdBy;

  // Block if already a member
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() as Partial<UserProfile> | undefined;
  if (user?.householdIds?.includes(householdId)) {
    throw new HttpsError(
      'failed-precondition',
      'You are already a member of this space.',
    );
  }

  const now = Date.now();
  // The invite link may suggest an access level; the owner still decides at approval.
  const requestedLevel = parseAccessLevel((req.data as { requestedLevel?: unknown })?.requestedLevel);
  const joinRequest: JoinRequest = {
    uid,
    displayName: user?.displayName ?? 'Unknown',
    email: user?.email ?? '',
    photoURL: user?.photoURL ?? null,
    status: 'pending',
    requestedLevel,
    requestedAt: now,
  };
  await db.doc(`households/${householdId}/joinRequests/${uid}`).set(joinRequest);

  // Notify the owner (best-effort; never fail the request because the push failed).
  await maybeNotifyOwner(householdId, ownerUid, user?.displayName ?? 'Someone');

  return { status: 'pending' as JoinStatus };
});

/**
 * Owner approves or rejects a pending join request.
 * On approve, union the householdId into the requester's householdIds.
 */
export const decideJoinRequest = onCall(async (req) => {
  const db = getFirestore();
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const data = req.data as {
    householdId?: string;
    requesterUid?: string;
    decision?: 'approve' | 'reject';
    accessLevel?: unknown;
  };
  const householdId = data?.householdId?.trim();
  const requesterUid = data?.requesterUid?.trim();
  const decision = data?.decision;
  if (!householdId || !requesterUid || !decision) {
    throw new HttpsError(
      'invalid-argument',
      'householdId, requesterUid, decision are required.',
    );
  }
  if (decision !== 'approve' && decision !== 'reject') {
    throw new HttpsError('invalid-argument', "decision must be 'approve' or 'reject'.");
  }

  // Verify caller is the household owner
  const hhSnap = await db.doc(`households/${householdId}/householdInfo/info`).get();
  if (!hhSnap.exists) {
    throw new HttpsError('not-found', 'Space not found.');
  }
  const household = hhSnap.data() as Household;
  if (household.createdBy !== callerUid) {
    throw new HttpsError(
      'permission-denied',
      'Only the space owner can decide join requests.',
    );
  }

  // Load the request; must exist and be pending
  const reqSnap = await db
    .doc(`households/${householdId}/joinRequests/${requesterUid}`)
    .get();
  if (!reqSnap.exists) {
    throw new HttpsError('not-found', 'Join request not found.');
  }
  const existing = reqSnap.data() as JoinRequest;
  if (existing.status !== 'pending') {
    throw new HttpsError('failed-precondition', `Request is already ${existing.status}.`);
  }

  const now = Date.now();
  if (decision === 'approve') {
    // The owner picks the access level at approval; fall back to the level the
    // joiner suggested, then to full (legacy behavior).
    const accessLevel = parseAccessLevel(data.accessLevel)
      ?? parseAccessLevel(existing.requestedLevel)
      ?? 'full';
    const batch = db.batch();
    batch.update(db.doc(`users/${requesterUid}`), {
      householdIds: FieldValue.arrayUnion(householdId),
      [`memberships.${householdId}`]: { accessLevel },
    });
    batch.set(
      db.doc(`households/${householdId}/joinRequests/${requesterUid}`),
      {
        status: 'approved',
        decidedAt: now,
        decidedBy: callerUid,
      } as Partial<JoinRequest>,
      { merge: true },
    );
    await batch.commit();
    await maybeNotifyRequester(householdId, requesterUid, true, household.name);
  } else {
    await db.doc(`households/${householdId}/joinRequests/${requesterUid}`).set(
      {
        status: 'rejected',
        decidedAt: now,
        decidedBy: callerUid,
      } as Partial<JoinRequest>,
      { merge: true },
    );
    await maybeNotifyRequester(householdId, requesterUid, false, household.name);
  }

  return { status: (decision === 'approve' ? 'approved' : 'rejected') as JoinStatus };
});

/**
 * Lists the members of a household. Callable because the Firestore rules
 * restrict users/{uid} reads to the owner of the doc — so the household owner
 * cannot run a client-side query across all members. Server-side query here.
 * Returns only what the UI needs (no secrets).
 */
export const listHouseholdMembers = onCall(async (req) => {
  const db = getFirestore();
  const callerUid = req.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const householdId = (req.data as { householdId?: string })?.householdId?.trim();
  if (!householdId) {
    throw new HttpsError('invalid-argument', 'householdId is required.');
  }

  // Any member can list the members of a household they belong to.
  const callerSnap = await db.doc(`users/${callerUid}`).get();
  const caller = callerSnap.data() as Partial<UserProfile> | undefined;
  if (!caller?.householdIds?.includes(householdId)) {
    throw new HttpsError('permission-denied', 'You are not a member of this space.');
  }

  const membersSnap = await db
    .collection('users')
    .where('householdIds', 'array-contains', householdId)
    .get();

  const hhSnap = await db.doc(`households/${householdId}/householdInfo/info`).get();
  const household = hhSnap.data() as Partial<Household> | undefined;
  const ownerUid = household?.createdBy;

  return {
    members: membersSnap.docs.map((d) => {
      const u = d.data() as Partial<UserProfile>;
      return {
        uid: d.id,
        displayName: u.displayName ?? 'Unknown',
        email: u.email ?? '',
        photoURL: u.photoURL ?? null,
        isOwner: d.id === ownerUid,
        accessLevel: accessLevelOf(u, householdId),
      };
    }),
  };
});
export const leaveHousehold = onCall(async (req) => {
  const db = getFirestore();
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const householdId = (req.data as { householdId?: string })?.householdId?.trim();
  if (!householdId) {
    throw new HttpsError('invalid-argument', 'householdId is required.');
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() as Partial<UserProfile> | undefined;
  if (!user) {
    throw new HttpsError('not-found', 'User profile not found.');
  }
  if (!user.householdIds?.includes(householdId)) {
    throw new HttpsError('failed-precondition', 'You are not a member of this space.');
  }

  const remaining = user.householdIds.filter((id) => id !== householdId);
  const nextActiveId =
    user.householdId === householdId ? (remaining[0] ?? null) : user.householdId;

  let nextRole: UserProfile['role'] = 'member';
  if (nextActiveId) {
    const nextHhSnap = await db
      .doc(`households/${nextActiveId}/householdInfo/info`)
      .get();
    const nextHh = nextHhSnap.data() as Partial<Household> | undefined;
    nextRole = nextHh?.createdBy === uid ? 'owner' : 'member';
  } else {
    nextRole = 'owner';
  }

  await db.doc(`users/${uid}`).set(
    {
      householdId: nextActiveId,
      householdIds: remaining,
      role: nextRole,
    } as Pick<UserProfile, 'householdId' | 'householdIds' | 'role'>,
    { merge: true },
  );

  return { householdId: nextActiveId };
});

// --- Notification helpers ---

async function maybeNotifyOwner(
  householdId: string,
  ownerUid: string,
  requesterName: string,
): Promise<void> {
  const db = getFirestore();
  try {
    const settingsSnap = await db
      .doc(`households/${householdId}/notificationSettings/${ownerUid}`)
      .get();
    const settings = settingsSnap.data() as Partial<NotificationSettings> | undefined;
    if (settings?.joinRequestEnabled === false) return;

    const tokens = await getTokensForUsers(householdId, [ownerUid]);
    if (tokens.length === 0) return;
    await sendToMany(
      householdId,
      tokens,
      buildMessagePayload({
        type: 'household_join',
        title: 'Join request',
        body: `${requesterName} requested to join your space`,
        householdId,
        deepLink: '/household',
      }),
    );
  } catch {
    // Best-effort — never fail the request because the push failed.
  }
}

async function maybeNotifyRequester(
  householdId: string,
  requesterUid: string,
  approved: boolean,
  householdName: string,
): Promise<void> {
  const db = getFirestore();
  try {
    const settingsSnap = await db
      .doc(`households/${householdId}/notificationSettings/${requesterUid}`)
      .get();
    const settings = settingsSnap.data() as Partial<NotificationSettings> | undefined;
    if (settings?.joinRequestEnabled === false) return;

    const tokens = await getTokensForUsers(householdId, [requesterUid]);
    if (tokens.length === 0) return;
    await sendToMany(
      householdId,
      tokens,
      buildMessagePayload({
        type: 'household_join',
        title: approved ? 'Request approved' : 'Request declined',
        body: approved
          ? `You were approved to join ${householdName}`
          : `Your request to join ${householdName} was declined.`,
        householdId,
        deepLink: '/household',
      }),
    );
  } catch {
    // Best-effort.
  }
}
