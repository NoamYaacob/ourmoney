// Local UI session state only — TanStack Query owns server state, and the
// real session shape (from the Supabase client) is not defined until
// Milestone 2/3. This placeholder shape gets replaced then, not extended.

import { create } from 'zustand'

interface AuthSession {
  userId: string
  expiresAt: string
}

interface AuthState {
  session: AuthSession | null
  setSession: (session: AuthSession | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
}))
