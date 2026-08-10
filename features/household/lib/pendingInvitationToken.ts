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

import * as SecureStore from 'expo-secure-store'
import type { QueryClient } from '@tanstack/react-query'

export const PENDING_INVITATION_SECURE_STORE_KEY = 'ourmoney.pendingInvitationToken'
export const pendingInvitationTokenQueryKey = ['auth', 'pending-invitation-token'] as const
export const PENDING_INVITATION_TTL_MS = 24 * 60 * 60 * 1000

interface StoredPendingInvitation {
  token: string
  storedAt: number
}

export async function storePendingInvitationToken(token: string): Promise<void> {
  const value: StoredPendingInvitation = { token, storedAt: Date.now() }
  await SecureStore.setItemAsync(PENDING_INVITATION_SECURE_STORE_KEY, JSON.stringify(value))
}

// Returns the stored token, or null if none exists or it has expired.
// Self-cleans an expired entry so it isn't re-evaluated as "still expired"
// on every future read.
export async function readPendingInvitationToken(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(PENDING_INVITATION_SECURE_STORE_KEY)
  if (!raw) return null

  let parsed: StoredPendingInvitation
  try {
    parsed = JSON.parse(raw) as StoredPendingInvitation
  } catch {
    // Not valid JSON — cannot have been written by storePendingInvitationToken.
    await SecureStore.deleteItemAsync(PENDING_INVITATION_SECURE_STORE_KEY)
    return null
  }

  if (Date.now() - parsed.storedAt > PENDING_INVITATION_TTL_MS) {
    await SecureStore.deleteItemAsync(PENDING_INVITATION_SECURE_STORE_KEY)
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
  await SecureStore.deleteItemAsync(PENDING_INVITATION_SECURE_STORE_KEY)
  queryClient.setQueryData(pendingInvitationTokenQueryKey, null)
}
