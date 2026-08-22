// Takes householdId as a plain parameter, never reads store/householdStore.ts
// directly — same discipline as usePlannedObligations.ts/useAccounts.ts.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { InstallmentPlan } from '@/types/app'

export function installmentPlansQueryKey(householdId: string | null | undefined) {
  return ['installmentPlans', householdId] as const
}

export function useInstallmentPlans(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: installmentPlansQueryKey(householdId),
    queryFn: async (): Promise<InstallmentPlan[]> => {
      const { data, error } = await supabase
        .from('installment_plans')
        .select('*')
        .eq('household_id', householdId as string)
        .order('first_charge_date', { ascending: false })
      if (error) throw error
      return data as InstallmentPlan[]
    },
    enabled: !!householdId,
  })

  return {
    plans: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
