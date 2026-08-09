// The active household ID, used to scope every query. Set once a household
// exists (Milestone 4) — nothing writes to this store yet.

import { create } from 'zustand'

interface HouseholdState {
  householdId: string | null
  setHouseholdId: (householdId: string | null) => void
}

export const useHouseholdStore = create<HouseholdState>((set) => ({
  householdId: null,
  setHouseholdId: (householdId) => set({ householdId }),
}))
