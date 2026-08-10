// Local UI state only. The Supabase session itself is server state and lives
// in the TanStack Query cache (features/auth/hooks/useAuth.ts), not here —
// see ADR review notes for Milestone 3. isBiometricLocked is genuinely local
// UI state: it is set by an AppState listener (useBiometricGuard.ts) and read
// by the (app) layout to render the lock overlay.

import { create } from 'zustand'

interface AuthUIState {
  isBiometricLocked: boolean
  setBiometricLocked: (locked: boolean) => void
}

export const useAuthStore = create<AuthUIState>((set) => ({
  isBiometricLocked: false,
  setBiometricLocked: (isBiometricLocked) => set({ isBiometricLocked }),
}))
