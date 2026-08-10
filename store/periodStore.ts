// The month currently being viewed on Dashboard/Budgets — genuinely local,
// ephemeral UI state with no server-side row underneath it (unlike
// householdStore.ts, which is a synchronized *cache* of a query result).
// Closer in kind to authStore.ts's isBiometricLocked. Written by: the month
// navigation UI (Dashboard/Budgets), and useSignOut.ts's reset call.

import { create } from 'zustand'
import { getCurrentMonthPeriodStart } from '@/features/budgets/lib/budgetPeriod'

interface PeriodState {
  selectedPeriodStart: string
  setSelectedPeriodStart: (periodStart: string) => void
  resetToCurrentMonth: () => void
}

export const usePeriodStore = create<PeriodState>((set) => ({
  selectedPeriodStart: getCurrentMonthPeriodStart(),
  setSelectedPeriodStart: (selectedPeriodStart) => set({ selectedPeriodStart }),
  resetToCurrentMonth: () => set({ selectedPeriodStart: getCurrentMonthPeriodStart() }),
}))
