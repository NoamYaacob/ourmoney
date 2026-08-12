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

import * as SecureStore from 'expo-secure-store'
// TEMPORARY — spinner-flash-on-tab-focus investigation. See
// lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
import { diagLog } from '@/lib/debug/spinnerDiagnostics'

export type AppearancePreference = 'light' | 'dark' | 'system'

export const APPEARANCE_SECURE_STORE_KEY = 'appearance_mode'
export const appearancePreferenceQueryKey = ['settings', 'appearance-preference'] as const

const VALID_VALUES: readonly AppearancePreference[] = ['light', 'dark', 'system']

function isValidPreference(value: string): value is AppearancePreference {
  return (VALID_VALUES as readonly string[]).includes(value)
}

// Defaults to 'system' when nothing is stored yet, or when the stored value
// is somehow malformed — never a hard error over a cosmetic preference.
export async function readAppearancePreference(): Promise<AppearancePreference> {
  // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts. Timing +
  // success/error only, no stored value.
  const start = Date.now()
  try {
    const raw = await SecureStore.getItemAsync(APPEARANCE_SECURE_STORE_KEY)
    diagLog('readAppearancePreference', { outcome: 'success', durationMs: Date.now() - start })
    if (raw && isValidPreference(raw)) return raw
    return 'system'
  } catch (error) {
    diagLog('readAppearancePreference', { outcome: 'error', durationMs: Date.now() - start })
    throw error
  }
}

export async function writeAppearancePreference(preference: AppearancePreference): Promise<void> {
  await SecureStore.setItemAsync(APPEARANCE_SECURE_STORE_KEY, preference)
}
