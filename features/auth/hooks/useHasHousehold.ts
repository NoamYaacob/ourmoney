// Minimal, purpose-built existence check for the auth guard's routing
// decision — deliberately NOT Milestone 4.4's useHousehold.ts (which will
// fetch full household details and populate store/householdStore.ts).
// Read-only, relies entirely on the existing household_members_select RLS
// policy (is_household_member(household_id)); a query filtered to
// user_id = self can only ever return the caller's own row(s), so this adds
// no client-side authorization logic — see ADR-008.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function householdMembershipQueryKey(userId: string | undefined) {
  return ['auth', 'household-membership', userId] as const
}

export function useHasHousehold(userId: string | undefined) {
  const query = useQuery({
    queryKey: householdMembershipQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('user_id')
        .eq('user_id', userId as string)
        .limit(1)
      if (error) throw error
      return data.length > 0
    },
    enabled: !!userId,
  })

  return {
    hasHousehold: userId ? query.data : undefined,
    isLoading: !!userId && query.isPending,
  }
}
