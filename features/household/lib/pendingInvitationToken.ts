// Persists the invite token an unauthenticated user tapped, across the
// sign-in/sign-up detour, per docs/PHASE_1_PLAN.md §4.3. SecureStore (not
// AsyncStorage, not Zustand-only/in-memory) because the app can be
// backgrounded or killed for an arbitrary length of time between "store the
// token, route to sign-in" and "consume the token once authenticated" — the
// same reason Supabase's own session survives a kill, this has to too.
//
// Bounded lifetime (adversarial review finding): the token is stored with a
// timestamp and treated as expired after PENDING_INVITATION_TTL_MS. Without
// this, a token stored by whoever tapped the link sits on the device
// indefinitely and gets silently inherited by a completely unrelated later
// authentication — features/auth/hooks/useSignOut.ts clearing it on
// sign-out closes that path when there WAS a prior session to sign out of,
// but not the case of a never-before-used device where a stranger's
// first-ever sign-up on it races an abandoned invite tap with no sign-out
// event to hook. A generous TTL (24h, well inside the invitation's own
// 7-day server-side expiry) is chosen deliberately over a short one: the
// legitimate flow can itself span this long, since Milestone 3's sign-up
// requires email confirmation, and a user may not check their email and
// return to complete sign-in for a while.
//
// Web storage split, same proven pattern as
// features/settings/lib/appearancePreference.ts: expo-secure-store has no
// real web implementation (its native module resolves to an empty object on
// web), so every SecureStore call here used to throw on web — meaning this
// token's TanStack Query (features/household/hooks/usePendingInvitationToken.ts,
// staleTime: Infinity) could never succeed on web, which only suppresses
// refetch-on-focus for a query that HAS succeeded — a query that never
// succeeds is always considered stale regardless of staleTime, so it
// refetched (and re-threw) on every window/tab focus, resetting straight
// back to isPending:true each time (the same mechanism already proven and
// fixed for appearancePreference.ts). This query feeds directly into
// features/auth/hooks/useAuthGuard.ts's combined isLoading, i.e.
// app/_layout.tsx's root AuthGate spinner — so this was a second, latent
// cause of a root-level spinner flash for every signed-in web user,
// independent of the already-fixed ThemeGate bug. Below, web reads/writes/
// deletes go through window.localStorage instead, under the same key, with
// identical TTL/validation logic, and are written so none of them ever
// reject — a storage failure (unavailable, throws, Safari private-mode
// quota, etc.) degrades to the same "no token" outcome an ordinary
// nothing-stored case already gets. Native behavior (expo-secure-store) is
// completely unchanged.

import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { QueryClient } from '@tanstack/react-query'

export const PENDING_INVITATION_SECURE_STORE_KEY = 'ourmoney.pendingInvitationToken'
export const pendingInvitationTokenQueryKey = ['auth', 'pending-invitation-token'] as const
export const PENDING_INVITATION_TTL_MS = 24 * 60 * 60 * 1000

interface StoredPendingInvitation {
  token: string
  storedAt: number
}

// Never throws: an unavailable/broken localStorage (private browsing,
// storage disabled, quota, etc.) is read exactly like "nothing stored yet."
function readWebValue(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(PENDING_INVITATION_SECURE_STORE_KEY)
  } catch {
    return null
  }
}

// Never throws: a failed write here just means the deferred-accept flow
// won't survive the sign-in detour on this device — not a crash-worthy
// failure.
function writeWebValue(value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(PENDING_INVITATION_SECURE_STORE_KEY, value)
  } catch {
    // Swallowed deliberately — see the file header comment.
  }
}

// Never throws: see writeWebValue — a failed delete just leaves a (still
// TTL-bounded, still explicitly re-checked on next read) stale entry.
function deleteWebValue(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(PENDING_INVITATION_SECURE_STORE_KEY)
  } catch {
    // Swallowed deliberately.
  }
}

async function deleteStoredToken(): Promise<void> {
  if (Platform.OS === 'web') {
    deleteWebValue()
    return
  }
  await SecureStore.deleteItemAsync(PENDING_INVITATION_SECURE_STORE_KEY)
}

export async function storePendingInvitationToken(token: string): Promise<void> {
  const value: StoredPendingInvitation = { token, storedAt: Date.now() }
  const serialized = JSON.stringify(value)
  if (Platform.OS === 'web') {
    writeWebValue(serialized)
    return
  }
  await SecureStore.setItemAsync(PENDING_INVITATION_SECURE_STORE_KEY, serialized)
}

// Returns the stored token, or null if none exists or it has expired.
// Self-cleans an expired entry so it isn't re-evaluated as "still expired"
// on every future read.
export async function readPendingInvitationToken(): Promise<string | null> {
  const raw =
    Platform.OS === 'web' ? readWebValue() : await SecureStore.getItemAsync(PENDING_INVITATION_SECURE_STORE_KEY)
  if (!raw) return null

  let parsed: StoredPendingInvitation
  try {
    parsed = JSON.parse(raw) as StoredPendingInvitation
  } catch {
    // Not valid JSON — cannot have been written by storePendingInvitationToken.
    await deleteStoredToken()
    return null
  }

  if (Date.now() - parsed.storedAt > PENDING_INVITATION_TTL_MS) {
    await deleteStoredToken()
    return null
  }

  return parsed.token
}

// Called only from the accept_invitation mutation's own settle (success or
// error) — never from the store-and-redirect-to-sign-in path, or the
// deferred acceptance flow would erase the token before the user ever
// reaches sign-in. See features/household/hooks/useInviteAcceptance.ts.
// Also called from features/auth/hooks/useSignOut.ts, so a device that
// switches signed-in accounts never carries a stale token into the next
// session.
export async function clearPendingInvitationToken(queryClient: QueryClient): Promise<void> {
  await deleteStoredToken()
  queryClient.setQueryData(pendingInvitationTokenQueryKey, null)
}
