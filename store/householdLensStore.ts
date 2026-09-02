// CP8D — the one shared Household Lens state (שלנו | שלי | שלך). Deliberately
// session/UI state, not persisted storage — this checkpoint's own
// instruction is "prefer session/UI state... do NOT add schema solely to
// remember the selected lens." Survives navigation within the app (this
// store is module-level, same pattern as householdStore.ts) and resets to
// DEFAULT_HOUSEHOLD_LENS on app relaunch. Never cleared on household switch
// or sign-out — it carries no financial or account-scoped data, only a
// display preference, so there is nothing to leak across an account switch
// the way householdId itself must guard against.
//
// CP8D correction: independent review found the lens has no truthful,
// visible effect on Home (see householdLens.ts's own audit header — no
// real data source behind Safe-to-Spend/Money Journey/Attention/Goals
// carries per-member attribution), so HouseholdLensControl was removed
// from MobileHome/DesktopDashboard. Only Transactions reads this store now.
// The store itself stays app-wide/shared rather than being narrowed to a
// Transactions-local store: it costs nothing extra kept as-is, it is
// already the correct shape for the one real consumer, and it is exactly
// what a second genuinely-attributable surface (should CP8D's audit ever
// find one) would reuse without any new plumbing. Narrowing it now would
// be refactoring for theoretical cleanliness the correction brief
// explicitly said not to do.

import { create } from 'zustand'
import { DEFAULT_HOUSEHOLD_LENS, type HouseholdLens } from '@/features/household/lib/householdLens'

interface HouseholdLensState {
  lens: HouseholdLens
  setLens: (lens: HouseholdLens) => void
}

export const useHouseholdLensStore = create<HouseholdLensState>((set) => ({
  lens: DEFAULT_HOUSEHOLD_LENS,
  setLens: (lens) => set({ lens }),
}))
