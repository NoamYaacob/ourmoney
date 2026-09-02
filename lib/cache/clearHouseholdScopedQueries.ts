// Shared by two call sites: features/auth/hooks/useSignOut.ts (sign-out)
// and features/auth/hooks/useHasHousehold.ts (D9 — mid-session household-
// membership revocation, no sign-out event). Extracted here specifically so
// the growing, hand-maintained prefix list lives in exactly one place
// instead of being duplicated across both call sites — flagged during
// Milestone 6 review as worth becoming a per-feature-module registry if it
// keeps growing at this rate through future milestones; not required yet.

import type { QueryClient } from '@tanstack/react-query'
import { useHouseholdStore } from '@/store/householdStore'
import { usePeriodStore } from '@/store/periodStore'

export function clearHouseholdScopedQueries(queryClient: QueryClient): void {
  useHouseholdStore.getState().setHouseholdId(null)
  void queryClient.removeQueries({ queryKey: ['household', 'current'] })
  void queryClient.removeQueries({ queryKey: ['auth', 'household-membership'] })
  void queryClient.removeQueries({ queryKey: ['accounts'] })
  void queryClient.removeQueries({ queryKey: ['categories'] })
  void queryClient.removeQueries({ queryKey: ['categoryRules'] })
  void queryClient.removeQueries({ queryKey: ['transactions'] })
  void queryClient.removeQueries({ queryKey: ['budgets'] })
  // Milestone 7 additions — same registry, same reasoning.
  void queryClient.removeQueries({ queryKey: ['recurringTransactions'] })
  void queryClient.removeQueries({ queryKey: ['savingsGoals'] })
  // CP8E — not required for correctness (the query key already includes
  // userId, so a different signed-in user always gets their own cache
  // entry) but kept here for the same hygiene every other entry in this
  // list already gets: no stale, unused snapshot sitting in memory past
  // sign-out.
  void queryClient.removeQueries({ queryKey: ['financialPulseSnapshot'] })
  usePeriodStore.getState().resetToCurrentMonth()
}
