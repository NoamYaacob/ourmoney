// Takes householdId as a plain parameter, never reads store/householdStore.ts
// directly — same discipline as features/accounts/hooks/useAccounts.ts and
// features/savings/hooks/useSavingsGoals.ts.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { PlannedObligation } from '@/types/app'

export function plannedObligationsQueryKey(householdId: string | null | undefined) {
  return ['plannedObligations', householdId] as const
}

export function usePlannedObligations(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: plannedObligationsQueryKey(householdId),
    queryFn: async (): Promise<PlannedObligation[]> => {
      const { data, error } = await supabase
        .from('planned_obligations')
        .select('*')
        .eq('household_id', householdId as string)
        .order('due_date', { ascending: true })
      if (error) throw error
      return data as PlannedObligation[]
    },
    enabled: !!householdId,
  })

  return {
    obligations: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    // Exposed for the detail screen's conflict-recovery flow — a failed
    // compare-and-swap means the mutation never invalidated this query, so
    // "load latest version" needs an explicit refetch, not a cache read
    // (same reasoning as useBudgetProgress.ts's own refetch export).
    refetch: query.refetch,
  }
}
