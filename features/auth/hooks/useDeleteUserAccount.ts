// Thin wrapper over the delete_own_account() RPC (migration 004). No
// parameters — the RPC resolves the caller's own household membership from
// auth.uid() alone and performs admin succession / sole-member household
// deletion / attribution cleanup entirely server-side. See that migration's
// header comment for the three confirmed product decisions this implements.
//
// This is a real, irreversible account deletion, not a soft delete — once
// it succeeds, the underlying auth.users row is gone and the current
// session's token is stale. onSuccess clears every cached query the same
// way useSignOut.ts does (household-scoped + financial prefixes + the
// pending-invitation token) and explicitly signs out to remove the
// now-invalid session from expo-secure-store — the RPC deleting the user
// row does not, by itself, clear anything client-side.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { clearHouseholdScopedQueries } from '@/lib/cache/clearHouseholdScopedQueries'
import { clearPendingInvitationToken } from '@/features/household/lib/pendingInvitationToken'

interface DeleteOwnAccountResult {
  ok: boolean
  error?: string
  household_deleted?: boolean
  new_admin_id?: string | null
}

// types/database.ts is never hand-edited (CLAUDE.md) — only a real
// `supabase gen types` run against a live migration-004 database may add
// this RPC name to the generated Functions union. Until that regeneration
// happens, supabase.rpc's typed overload doesn't know this function name
// exists, so this one narrow, explicit cast stands in for it — same pattern
// as features/recurring/hooks/useGenerateRecurringTransactions.ts.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: 'delete_own_account'
) => Promise<{ data: unknown; error: unknown }>

export function useDeleteUserAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await rpc('delete_own_account')
      if (error) throw error

      const result = data as unknown as DeleteOwnAccountResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')
      return result
    },
    onSuccess: async () => {
      clearHouseholdScopedQueries(queryClient)
      void clearPendingInvitationToken(queryClient)
      // The account is already gone server-side by this point — a failed
      // sign-out must never re-surface as a failed *deletion* to the user.
      // TanStack Query flips the whole mutation to isError if onSuccess
      // throws, and supabase-js's signOut() can reject with a raw
      // exception (not just a returned {error}) on a dropped connection —
      // exactly the kind of thing that happens as the app backgrounds
      // right after a destructive action (qa-adversarial-reviewer finding,
      // Milestone 9). Best-effort only: the RPC deleting the row is what
      // actually matters; local session cleanup failing here is a
      // cosmetic gap (a stale token that a future authenticated request
      // will fail on anyway, once the account no longer exists), not a
      // reason to tell the user their deletion didn't work.
      try {
        await supabase.auth.signOut()
      } catch {
        // Swallowed deliberately — see comment above.
      }
    },
  })
}
