// docs/PHASE_1_PLAN.md §4.2: plain INSERT (not an RPC) — invitations_insert's
// RLS policy (is_household_admin(household_id)) is the real gate, and the
// household creator is always admin (create_household sets that itself), so
// this is always reachable from invite-partner.
//
// invited_by is ALWAYS derived from useAuth()'s own session, never accepted
// as a parameter — RLS's is_household_admin(household_id) check already
// prevents any security consequence from a wrong value (household isolation
// doesn't depend on invited_by), but an unconstrained invited_by would
// corrupt any future "invited by" display (architecture review finding).
//
// The insert payload deliberately omits `token` entirely — migration 001
// already defines `token TEXT NOT NULL UNIQUE DEFAULT
// encode(gen_random_bytes(32), 'hex')` (32 bytes from pgcrypto,
// cryptographically strong). The client never generates or supplies a
// token value; it only reads back whatever the database generated.
//
// Per this session's decision, every call creates a fresh invitation row —
// no reuse-latest-pending-invitation logic, matching §4.2's literal steps.

import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'

export function useCreateInvitation(householdId: string) {
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('invitations')
        .insert({ household_id: householdId, invited_by: user?.id as string })
        .select('token')
        .single()
      if (error) throw error
      return data.token
    },
  })
}
