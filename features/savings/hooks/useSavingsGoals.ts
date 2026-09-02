// Takes householdId as a plain parameter, never reads store/householdStore.ts
// directly — same discipline as features/accounts/hooks/useAccounts.ts.
// Callers MUST source householdId from useHousehold(user?.id)'s live return
// value.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { SavingsGoal } from '@/types/app'

export function savingsGoalsQueryKey(householdId: string | null | undefined) {
  return ['savingsGoals', householdId] as const
}

export function useSavingsGoals(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: savingsGoalsQueryKey(householdId),
    queryFn: async (): Promise<SavingsGoal[]> => {
      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('household_id', householdId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      // progress_source narrows a CHECK-constrained TEXT column the same
      // way RecurringTransaction narrows frequency (useRecurringTransactions.ts).
      return data as SavingsGoal[]
    },
    enabled: !!householdId,
  })

  return {
    goals: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    // See features/accounts/hooks/useAccounts.ts's identical field: `data`
    // survives a failed background refetch, so this is the only reliable
    // "never loaded" signal distinct from `error`.
    hasData: query.data !== undefined,
    // Exposed for the detail screen's conflict-recovery flow — see
    // usePlannedObligations.ts's identical export for the reasoning.
    refetch: query.refetch,
  }
}
