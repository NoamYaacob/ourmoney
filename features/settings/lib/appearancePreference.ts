// Persists the user's theme override across app restarts, per
// docs/PHASE_1_PLAN.md §5.3. Same SecureStore-backed, TanStack-Query-read
// shape as features/household/lib/pendingInvitationToken.ts — the
// established pattern in this codebase for a small piece of local device
// state that must survive a kill.
//
// Deliberately a bare, unscoped key (not per-user) — this is a device
// property (what does this screen look like on this phone), not an account
// property, so it must NOT be cleared on sign-out the way
// pendingInvitationToken.ts's token is. A shared device should keep
// whatever appearance was chosen across a sign-out/sign-in cycle.
//
// Web storage split (root cause of a confirmed bug — see git history):
// expo-secure-store has no real web implementation; its native module
// resolves to an empty object on web (same finding as
// lib/supabase/client.ts's own comment), so every SecureStore call used to
// throw on web. features/settings/hooks/useTheme.ts's query has
// staleTime: Infinity, which only suppresses refetch-on-focus for a query
// that has actually succeeded at least once (dataUpdatedAt > 0) — a query
// that has NEVER succeeded is always considered stale regardless of
// staleTime, so it refetched (and re-threw) on every window/tab focus.
// Starting a fresh fetch on a query whose data is still undefined resets
// its status to 'pending', which is what flashed ThemeGate's full-screen
// ActivityIndicator back on for the duration of each retry cycle every
// time the tab regained focus — proven via a real Safari/Mac capture
// against the hosted Preview project. Below, web reads/writes go through
// window.localStorage instead, with the exact same key and validation as
// native, and are written to NEVER reject — a storage failure (unavailable,
// throws, Safari private-mode quota, etc.) degrades to the same 'system'
// default / silent no-op an ordinary "nothing stored yet" case already
// gets, so this query can always succeed on web and therefore never
// re-enters that always-stale state again.

import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

export type AppearancePreference = 'light' | 'dark' | 'system'

export const APPEARANCE_SECURE_STORE_KEY = 'appearance_mode'
export const appearancePreferenceQueryKey = ['settings', 'appearance-preference'] as const

const VALID_VALUES: readonly AppearancePreference[] = ['light', 'dark', 'system']

function isValidPreference(value: string): value is AppearancePreference {
  return (VALID_VALUES as readonly string[]).includes(value)
}

// Never throws: an unavailable/broken localStorage (private browsing,
// storage disabled, quota, etc.) is read exactly like "nothing stored yet."
function readWebValue(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(APPEARANCE_SECURE_STORE_KEY)
  } catch {
    return null
  }
}

// Never throws: this is a cosmetic preference — a write failure must not
// crash or blank the app, only silently fail to persist.
function writeWebValue(preference: AppearancePreference): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(APPEARANCE_SECURE_STORE_KEY, preference)
  } catch {
    // Swallowed deliberately — see the file header comment.
  }
}

// Defaults to 'system' when nothing is stored yet, or when the stored value
// is somehow malformed — never a hard error over a cosmetic preference.
export async function readAppearancePreference(): Promise<AppearancePreference> {
  const raw =
    Platform.OS === 'web' ? readWebValue() : await SecureStore.getItemAsync(APPEARANCE_SECURE_STORE_KEY)
  if (raw && isValidPreference(raw)) return raw
  return 'system'
}

export async function writeAppearancePreference(preference: AppearancePreference): Promise<void> {
  if (Platform.OS === 'web') {
    writeWebValue(preference)
    return
  }
  await SecureStore.setItemAsync(APPEARANCE_SECURE_STORE_KEY, preference)
}
