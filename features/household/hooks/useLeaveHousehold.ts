// Thin wrapper over the leave_household() RPC (migration 005). No
// parameters — the RPC resolves the caller's own household membership from
// auth.uid() alone and performs admin succession / sole-member household
// deletion / attribution cleanup entirely server-side, exactly like
// delete_own_account() (see that hook's own header comment for the shared
// pattern) — except this one never touches auth.users. The caller keeps
// their account; they simply stop being a member of this household. See
// migration 005's own header comment and docs/DECISIONS.md ADR-034 for the
// three product decisions this implements.
//
// Used for BOTH Settings affordances that reduce to this same RPC call: a
// member leaving, and an admin leaving (now safe, unlike the raw
// household_members_delete path useRemoveHouseholdMember.ts still uses for
// "admin removes a non-admin member" — that case needs no succession logic
// and is intentionally left on the simpler raw path).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { clearHouseholdScopedQueries } from '@/lib/cache/clearHouseholdScopedQueries'

export interface LeaveHouseholdResult {
  ok: boolean
  error?: string
  household_deleted?: boolean
  new_admin_id?: string | null
}

// types/database.ts is never hand-edited (CLAUDE.md) — only a real
// `supabase gen types` run against a live migration-005 database may add
// this RPC name to the generated Functions union. Until that regeneration
// happens, supabase.rpc's typed overload doesn't know this function name
// exists, so this one narrow, explicit cast stands in for it — same pattern
// as features/auth/hooks/useDeleteUserAccount.ts's identical cast for
// delete_own_account.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: 'leave_household'
) => Promise<{ data: unknown; error: unknown }>

export function useLeaveHousehold() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<LeaveHouseholdResult> => {
      const { data, error } = await rpc('leave_household')
      if (error) throw error

      const result = data as unknown as LeaveHouseholdResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')
      return result
    },
    onSuccess: () => {
      // Same registry useSignOut.ts/useHasHousehold.ts (D9) already
      // maintain for "this session no longer belongs to a household" —
      // clearing it here is immediate, rather than waiting on D9's own
      // polling (up to 60s, or next focus/mount) to notice the same
      // membership-row change. Routing away from household-scoped screens
      // is not duplicated here — it already happens as a side effect of
      // useHasHousehold's query refetching and useAuthGuard.ts's existing
      // redirect effect, the same "cache-clearing owns invalidation,
      // the guard owns routing" split useHasHousehold.ts documents.
      clearHouseholdScopedQueries(queryClient)
    },
  })
}
