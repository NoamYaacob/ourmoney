// docs/PHASE_1_PLAN.md §4.4: fetches the current user's household on app
// launch and populates store/householdStore.ts. TanStack Query is the
// source of truth for the household row itself; the store is a synchronized
// *cache* of this query's result for screens that need a fast, synchronous
// read of "which household is active" — it is never an independent write
// authority (the same posture features/auth/hooks/useAuth.ts and
// store/authStore.ts settled on for session state; see that file's own
// comment). Three call sites write to the store: this hook's sync effect,
// useCreateHousehold.ts, and useAcceptInvitation.ts.
//
// Scoped to the caller's own user_id, same posture as useHasHousehold.ts —
// RLS (household_members_select / households_select) is the real isolation
// boundary, not this client-side filter (ADR-008).

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useHouseholdStore } from '@/store/householdStore'
import type { Household } from '@/types/app'

export function householdQueryKey(userId: string | undefined) {
  return ['household', 'current', userId] as const
}

interface MembershipRow {
  household_id: string
  role: string
  households: Household
}

export function useHousehold(userId: string | undefined) {
  const setHouseholdId = useHouseholdStore((state) => state.setHouseholdId)

  const query = useQuery({
    queryKey: householdQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id, role, households(*)')
        .eq('user_id', userId as string)
        .maybeSingle()
      if (error) throw error
      return data as MembershipRow | null
    },
    enabled: !!userId,
  })

  useEffect(() => {
    if (!userId) {
      setHouseholdId(null)
      return
    }
    if (query.data) setHouseholdId(query.data.household_id)
  }, [userId, query.data, setHouseholdId])

  return {
    householdId: query.data?.household_id ?? null,
    household: query.data?.households ?? null,
    isLoading: !!userId && query.isPending,
    error: query.error,
  }
}
