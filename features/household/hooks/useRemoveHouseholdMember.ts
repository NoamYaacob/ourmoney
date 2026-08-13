// A single plain DELETE on household_members, deliberately shared by two
// screen affordances that both reduce to the same row-level operation under
// household_members_delete's RLS policy (migration 001):
//   - an admin removing a MEMBER row ("remove member" in Settings)
//   - a MEMBER removing their OWN row ("leave household" in Settings)
// household_members_delete permits `is_household_admin(household_id) OR
// user_id = auth.uid()` — both call sites above are safe subsets of that
// policy specifically BECAUSE there is exactly one admin per household
// (PROJECT_SPEC.md): removing a non-admin member, or a non-admin member
// removing themselves, can never leave a household with zero admins.
//
// Deliberately NOT wired for an admin to remove/leave as themselves — that
// would need real admin-succession logic (the kind delete_own_account's RPC
// has, migration 004) that this raw DELETE does not provide. The Settings
// screen gates both affordances so an admin never reaches this hook via
// self-targeting; see that screen's own comment for the exact gating.
//
// Cache invalidation here is deliberately narrow (household_members list
// only). For the self-leave case, useHasHousehold.ts's existing D9
// revocation-detection polling already owns clearing household-scoped
// financial caches and routing back to onboarding once it observes the
// caller's own membership row is gone — not duplicated here.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { householdMembersQueryKey } from './useHouseholdMembers'

interface RemoveHouseholdMemberInput {
  householdId: string
  userId: string
}

export function useRemoveHouseholdMember(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ householdId: targetHouseholdId, userId }: RemoveHouseholdMemberInput) => {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', targetHouseholdId)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: householdMembersQueryKey(householdId) })
    },
  })
}
