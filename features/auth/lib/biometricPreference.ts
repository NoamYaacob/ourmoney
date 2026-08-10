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

import * as SecureStore from 'expo-secure-store'

export const BIOMETRIC_ENABLED_SECURE_STORE_KEY = 'biometric_enabled'
export const biometricPreferenceQueryKey = ['settings', 'biometric-preference'] as const

export async function readBiometricPreference(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_SECURE_STORE_KEY)
  if (raw === 'false') return false
  return true
}

export async function writeBiometricPreference(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_SECURE_STORE_KEY, enabled ? 'true' : 'false')
}
