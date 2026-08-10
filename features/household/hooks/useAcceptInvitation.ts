// docs/PHASE_1_PLAN.md §4.3: calls the atomic, ten-condition-audited
// accept_invitation RPC (ADR-010) verbatim — do not simplify it, and this
// hook adds no logic on top beyond interpreting its documented response
// contract. ok:false cases (already_in_household, invalid_invitation,
// unauthenticated) are RESOLVED values, not thrown errors.
//
// household.member_joined is emitted only when already_member is false —
// an idempotent re-tap of an already-consumed invite link must not
// re-announce a join that already happened. invitationId is emitted as
// null: accept_invitation's response doesn't include the invitation's own
// row id, and per this session's decision that's not being changed by
// widening the RPC this milestone (see docs/DECISIONS.md discussion in the
// Milestone 4 report — no migration/RLS change without a proven defect).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { householdMembershipQueryKey } from '@/features/auth/hooks/useHasHousehold'
import { emit } from '@/lib/events/dispatcher'
import { useHouseholdStore } from '@/store/householdStore'
import { householdQueryKey } from './useHousehold'

export type AcceptInvitationResult =
  | { ok: true; household_id: string; already_member: boolean }
  | { ok: false; error: 'already_in_household' | 'invalid_invitation' | 'unauthenticated' }

export function useAcceptInvitation() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (token: string): Promise<AcceptInvitationResult> => {
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
      if (error) throw error
      return data as unknown as AcceptInvitationResult
    },
    onSuccess: (result) => {
      if (!result.ok) return

      useHouseholdStore.getState().setHouseholdId(result.household_id)
      void queryClient.invalidateQueries({ queryKey: householdMembershipQueryKey(user?.id) })
      void queryClient.invalidateQueries({ queryKey: householdQueryKey(user?.id) })

      if (!result.already_member) {
        emit({
          type: 'household.member_joined',
          householdId: result.household_id,
          actorId: user?.id ?? null,
          occurredAt: new Date().toISOString(),
          payload: { memberId: user?.id ?? '', invitationId: null },
        })
      }
    },
  })
}
