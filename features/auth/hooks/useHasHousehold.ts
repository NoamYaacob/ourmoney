// Minimal, purpose-built existence check for the auth guard's routing
// decision — deliberately NOT Milestone 4.4's useHousehold.ts (which will
// fetch full household details and populate store/householdStore.ts).
// Read-only, relies entirely on the existing household_members_select RLS
// policy (is_household_member(household_id)); a query filtered to
// user_id = self can only ever return the caller's own row(s), so this adds
// no client-side authorization logic — see ADR-008.
//
// D9 (Milestone 6): a member removed from their household mid-session (no
// sign-out event) must not keep seeing stale cached financial data. This
// hook is the one place that already re-observes membership on its normal
// staleTime/focus-refetch cadence, so it is the natural detection point: a
// true -> false transition triggers the same fail-closed cleanup
// useSignOut.ts uses (clear financial query caches, reset the selected
// period). Routing away from protected screens is NOT duplicated here — it
// already happens as a side effect of hasHousehold flipping to false, via
// useAuthGuard.ts's existing effect (computeAuthRedirect already treats
// hasHousehold:false as "go to onboarding"). This hook only owns the cache
// invalidation; the guard owns routing — two effects, two lists.
//
// refetchInterval (qa-adversarial-reviewer finding): the only refetch
// triggers otherwise available are the default staleTime lapsing on next
// mount/focus and lib/queryClient.ts's focusManager (background/foreground
// AppState transitions) — neither fires for a session that simply stays
// foregrounded and mounted the whole time, which is a completely normal way
// to use a phone. Without a floor on how long a revoked member can keep
// looking at a live, mounted screen, D9's fail-closed guarantee could go
// unmet for an arbitrarily long time in that case. RLS is still the hard
// backstop regardless (a revoked member's own writes are rejected
// server-side the moment is_household_member(household_id) turns false,
// independent of anything client-side) — this interval bounds how long a
// *read-only, stale-display* window can last, not a security boundary.

import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { clearHouseholdScopedQueries } from '@/lib/cache/clearHouseholdScopedQueries'
// TEMPORARY — spinner-flash-on-tab-focus investigation. See
// lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
import { diagLog } from '@/lib/debug/spinnerDiagnostics'

const D9_REVOCATION_CHECK_INTERVAL_MS = 60_000

export function householdMembershipQueryKey(userId: string | undefined) {
  return ['auth', 'household-membership', userId] as const
}

export function useHasHousehold(userId: string | undefined) {
  const queryClient = useQueryClient()
  const previousHasHouseholdRef = useRef<boolean | undefined>(undefined)

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
    refetchInterval: D9_REVOCATION_CHECK_INTERVAL_MS,
  })

  // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts.
  useEffect(() => {
    diagLog('useHasHousehold query', {
      status: query.status,
      fetchStatus: query.fetchStatus,
      hasHousehold: query.data === undefined ? 'undefined' : query.data,
    })
  }, [query.status, query.fetchStatus, query.data])

  useEffect(() => {
    if (previousHasHouseholdRef.current === true && query.data === false) {
      // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts.
      diagLog('useHasHousehold D9 clear triggered', { previous: true, next: false })
      clearHouseholdScopedQueries(queryClient)
    }
    previousHasHouseholdRef.current = query.data
  }, [query.data, queryClient])

  // A fresh mount (e.g. a different user signing in on the same device)
  // must not carry over a stale previous-value ref from whoever used the
  // hook before — reset whenever the observed user changes.
  useEffect(() => {
    previousHasHouseholdRef.current = undefined
  }, [userId])

  return {
    hasHousehold: userId ? query.data : undefined,
    isLoading: !!userId && query.isPending,
  }
}
