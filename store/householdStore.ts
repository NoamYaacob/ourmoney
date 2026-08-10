// The active household ID, used to scope every query. Written by
// features/household/hooks/useHousehold.ts (sync from the server query),
// useCreateHousehold.ts, and useAcceptInvitation.ts; cleared by
// features/auth/hooks/useSignOut.ts on sign-out.

import { create } from 'zustand'

interface HouseholdState {
  householdId: string | null
  setHouseholdId: (householdId: string | null) => void
}

export const useHouseholdStore = create<HouseholdState>((set) => ({
  householdId: null,
  setHouseholdId: (householdId) => set({ householdId }),
}))
