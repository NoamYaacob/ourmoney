// Persists the user's opt-out of the Milestone 3 biometric app lock, per
// docs/PHASE_1_PLAN.md §5.2's Security toggle. Same SecureStore-backed,
// TanStack-Query-read shape as ../../household/lib/pendingInvitationToken.ts
// and ../../settings/lib/appearancePreference.ts.
//
// Deliberately a bare, unscoped key, like appearance_mode — this is a
// device/app-lock property, not a per-account one, and is NOT cleared on
// sign-out.
//
// Fail-closed default: readBiometricPreference() returns `true` (enabled)
// whenever nothing is stored yet, or the stored value is malformed. Every
// existing install's lock behavior is completely unchanged unless a user
// explicitly opts out — this preference can only ever turn the lock OFF
// relative to today's behavior, never silently ON-by-default-off.
//
// Web storage split, same proven pattern as appearancePreference.ts:
// expo-secure-store has no real web implementation, so every SecureStore
// call here used to throw on web, meaning this preference's TanStack Query
// (features/auth/hooks/useBiometricPreference.ts, staleTime: Infinity)
// could never succeed there — same latent spinner-flash mechanism already
// fixed for appearancePreference.ts (a query that never succeeds is always
// stale regardless of staleTime, so it refetches, and re-throws, on every
// window/tab focus). The practical blast radius here is smaller — this
// hook only disables/enables a Settings screen toggle, and
// useBiometricGuard.ts already never locks on web regardless of this
// value's outcome — but the fix is the same for consistency and to close
// the pattern everywhere it exists. Web reads/writes go through
// window.localStorage instead, under the same key, and never reject — a
// storage failure degrades to the same fail-closed `true` default an
// ordinary nothing-stored case already gets. Native behavior
// (expo-secure-store) is completely unchanged.

import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

export const BIOMETRIC_ENABLED_SECURE_STORE_KEY = 'biometric_enabled'
export const biometricPreferenceQueryKey = ['settings', 'biometric-preference'] as const

// Never throws: an unavailable/broken localStorage is read exactly like
// "nothing stored yet," which readBiometricPreference already treats as
// fail-closed `true`.
function readWebValue(): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage.getItem(BIOMETRIC_ENABLED_SECURE_STORE_KEY)
  } catch {
    return null
  }
}

// Never throws: this preference has no security consequence on web (the
// biometric lock never engages there regardless), so a write failure is
// purely cosmetic — the toggle just won't remember its state.
function writeWebValue(value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.setItem(BIOMETRIC_ENABLED_SECURE_STORE_KEY, value)
  } catch {
    // Swallowed deliberately — see the file header comment.
  }
}

export async function readBiometricPreference(): Promise<boolean> {
  const raw =
    Platform.OS === 'web' ? readWebValue() : await SecureStore.getItemAsync(BIOMETRIC_ENABLED_SECURE_STORE_KEY)
  if (raw === 'false') return false
  return true
}

export async function writeBiometricPreference(enabled: boolean): Promise<void> {
  const value = enabled ? 'true' : 'false'
  if (Platform.OS === 'web') {
    writeWebValue(value)
    return
  }
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_SECURE_STORE_KEY, value)
}
