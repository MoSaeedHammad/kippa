import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, query as fsQuery, where, onSnapshot } from 'firebase/firestore';
import { authLib } from '@/libs/auth';
import { ledgerLib } from '@/libs/ledger';
import { db as firestoreDb } from '@/config/firebase';
import { detectBaseCurrency } from '@/libs/currencyMeta';
import { UserProfile, Household, JoinStatus, JoinRequest, AccessLevel } from '@kippa/domain';
import { AppContext } from '@/contexts/appContextInstance';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const queryClient = useQueryClient();

  // Listen to authentication state changes
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    authLib.signInForLocalPreview()
      .catch((error) => console.error(error))
      .finally(() => {
        if (cancelled) return;
        unsubscribe = authLib.onAuthStateChanged((profile) => {
          setUserProfile(profile);
          setIsAuthLoading(false);
        });
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Ensure active household exists in Firestore
  useEffect(() => {
    if (userProfile?.householdId && userProfile?.uid) {
      ledgerLib.ensureHouseholdExists(userProfile.householdId, userProfile.uid, 'My space');
    }
  }, [userProfile?.householdId, userProfile?.uid]);

  const householdId = userProfile?.householdId || '';

  // Query user households
  const { data: userHouseholds = [], isLoading: isLoadingHouseholds } = useQuery({
    queryKey: ['userHouseholds', userProfile?.householdIds],
    queryFn: async () => {
      if (!userProfile?.householdIds) return [];
      return Promise.all(
        userProfile.householdIds.map(async (id) => {
          const info = await ledgerLib.getHouseholdInfo(id);
          return info || {
            id,
            name: `Shared account (${id})`,
            baseCurrency: detectBaseCurrency(),
            createdAt: '',
            createdBy: ''
          };
        })
      );
    },
    enabled: !!userProfile?.householdIds,
  });

  // Owner flag for the active household
  const isOwner = householdId
    ? userHouseholds.find((h) => h.id === householdId)?.createdBy === userProfile?.uid
    : false;

  // Pending join requests (owner view) — live subscription.
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  useEffect(() => {
    if (!householdId || !isOwner || !firestoreDb) {
      // Clear stale pending list when the user is no longer an owner of an
      // active household. Synchronous clear is intentional here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingRequests([]);
      return;
    }
    const q = fsQuery(
      collection(firestoreDb, `households/${householdId}/joinRequests`),
      where('status', '==', 'pending'),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => d.data() as JoinRequest);
      list.sort((a, b) => b.requestedAt - a.requestedAt);
      setPendingRequests(list);
    });
    return () => unsub();
  }, [householdId, isOwner]);

  // Member list (owner view) — via Callable because rules restrict users/{uid}
  // reads to the doc owner.
  const { data: householdMembers = [], isLoading: isMembersLoading } = useQuery({
    queryKey: ['householdMembers', householdId],
    queryFn: async () => {
      if (!householdId || !userProfile) return [];
      return authLib.listHouseholdMembers(userProfile.uid, householdId);
    },
    enabled: !!householdId && isOwner && !!userProfile,
  });

  const loginWithGoogle = async () => {
    const profile = await authLib.signInWithGoogle();
    setUserProfile(profile);
  };

  const logout = async () => {
    await authLib.logout();
    setUserProfile(null);
    queryClient.clear();
  };

  const switchHousehold = async (id: string) => {
    if (!userProfile) return;
    const updatedProfile = await authLib.switchHousehold(userProfile.uid, id);
    setUserProfile(updatedProfile);
  };

  const createHousehold = async (name: string): Promise<Household> => {
    if (!userProfile) throw new Error('Not authenticated');
    const household = await authLib.createHousehold(userProfile.uid, name);
    // Refresh user profile after creating household
    const updatedProfile = await authLib.getUserProfile(userProfile.uid);
    if (updatedProfile) {
      setUserProfile(updatedProfile);
    }
    return household;
  };

  const requestToJoinHousehold = async (id: string, requestedLevel?: AccessLevel): Promise<JoinStatus> => {
    if (!userProfile) throw new Error('Not authenticated');
    return authLib.requestToJoinHousehold(userProfile.uid, id, requestedLevel);
  };

  const decideJoinRequest = async (
    householdId: string,
    requesterUid: string,
    decision: 'approve' | 'reject',
    accessLevel?: AccessLevel,
  ): Promise<void> => {
    if (!userProfile) throw new Error('Not authenticated');
    await authLib.decideJoinRequest(userProfile.uid, householdId, requesterUid, decision, accessLevel);
    // Invalidate any queries that list members/requests.
    queryClient.invalidateQueries({ queryKey: ['householdMembers', householdId] });
  };

  const leaveHousehold = async (id: string) => {
    if (!userProfile) return;
    const updatedProfile = await authLib.leaveHousehold(userProfile.uid, id);
    setUserProfile(updatedProfile);
  };

  const updateUserProfile = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  return (
    <AppContext.Provider
      value={{
        userProfile,
        householdId,
        isAuthLoading,
        userHouseholds,
        isLoadingHouseholds,
        loginWithGoogle,
        logout,
        switchHousehold,
        createHousehold,
        requestToJoinHousehold,
        decideJoinRequest,
        leaveHousehold,
        updateUserProfile,
        pendingRequests,
        householdMembers,
        isMembersLoading,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
