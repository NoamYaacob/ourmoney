// CP8D — the one shared Household Lens state (שלנו | שלי | שלך), so Home
// and Transactions read the same selection instead of each screen owning
// its own filter. Deliberately session/UI state, not persisted storage —
// this checkpoint's own instruction is "prefer session/UI state... do NOT
// add schema solely to remember the selected lens." Survives navigation
// within the app (this store is module-level, same pattern as
// householdStore.ts) and resets to DEFAULT_HOUSEHOLD_LENS on app relaunch.
// Never cleared on household switch or sign-out — it carries no financial
// or account-scoped data, only a display preference, so there is nothing
// to leak across an account switch the way householdId itself must guard
// against.

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
