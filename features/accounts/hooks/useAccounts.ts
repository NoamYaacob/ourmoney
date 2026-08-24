// Takes householdId as a plain parameter, never reads store/householdStore.ts
// directly — the same discipline useHouseholdMembers.ts documents. Callers
// MUST source householdId from useHousehold(user?.id)'s live return value.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Account } from '@/types/app'

export function accountsQueryKey(householdId: string | null | undefined) {
  return ['accounts', householdId] as const
}

export function useAccounts(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: accountsQueryKey(householdId),
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('household_id', householdId as string)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!householdId,
  })

  return {
    accounts: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    // Exposed so a failed fetch has a real retry path — see
    // usePlannedObligations.ts's identical export for the reasoning.
    refetch: query.refetch,
  }
}
