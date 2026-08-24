// Lean companion query to useInstallmentPlans.ts, mirroring
// useAccountBalances.ts's own pattern exactly: fetches only
// installment_plan_id for every transaction in the household and reduces it
// to a per-plan materialized count via the pure
// computeInstallmentMaterializedCounts function.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { computeInstallmentMaterializedCounts } from '../lib/computeInstallmentMaterializedCounts'

export function installmentMaterializedCountsQueryKey(householdId: string | null | undefined) {
  return ['installmentPlans', 'materializedCounts', householdId] as const
}

export function useInstallmentMaterializedCounts(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: installmentMaterializedCountsQueryKey(householdId),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('installment_plan_id')
        .eq('household_id', householdId as string)
        .not('installment_plan_id', 'is', null)
      if (error) throw error
      return computeInstallmentMaterializedCounts(data)
    },
    enabled: !!householdId,
  })

  return {
    materializedCounts: query.data ?? {},
    isLoading: !!householdId && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
