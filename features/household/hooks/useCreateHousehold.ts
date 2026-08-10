// docs/PHASE_1_PLAN.md §4.1: calls the atomic create_household RPC — never
// two client-side inserts (see docs/DATABASE_SCHEMA.md's rationale). Its
// ok:false cases (invalid_name, already_in_household) are RESOLVED values,
// not thrown errors — create_household never throws for its documented
// failure modes, so the screen inspects `result.ok`, not a mutation error
// state.
//
// Invalidating ['auth','household-membership',userId] on success is what
// makes the auth guard transition immediately without an app restart — the
// literal fix for the gap flagged at the end of the Milestone 3 report.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { householdMembershipQueryKey } from '@/features/auth/hooks/useHasHousehold'
import { useHouseholdStore } from '@/store/householdStore'
import { householdQueryKey } from './useHousehold'

export type CreateHouseholdResult =
  | { ok: true; household_id: string }
  | { ok: false; error: 'invalid_name' | 'already_in_household' | 'unauthenticated' }

export function useCreateHousehold() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string): Promise<CreateHouseholdResult> => {
      const { data, error } = await supabase.rpc('create_household', { p_name: name })
      if (error) throw error
      return data as unknown as CreateHouseholdResult
    },
    onSuccess: (result) => {
      if (!result.ok) return
      useHouseholdStore.getState().setHouseholdId(result.household_id)
      void queryClient.invalidateQueries({ queryKey: householdMembershipQueryKey(user?.id) })
      void queryClient.invalidateQueries({ queryKey: householdQueryKey(user?.id) })
    },
  })
}
