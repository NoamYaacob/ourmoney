// A plain DELETE on household_members, used only for "admin removes a
// MEMBER row" in Settings — a safe subset of household_members_delete's
// RLS policy specifically BECAUSE there is exactly one admin per household
// (PROJECT_SPEC.md): removing a non-admin member can never leave a
// household with zero admins, so this needs no succession logic.
//
// "Leave household" (self-removal) no longer uses this hook — as of
// migration 005, it goes through leave_household(), a SECURITY DEFINER RPC
// with real admin-succession/sole-member-cascade logic, and that
// migration's Part 3 tightened household_members_delete itself so an
// admin's own row can no longer be deleted via this raw path at all (only
// through leave_household()/delete_own_account(), both of which bypass RLS
// entirely for their own writes). See features/household/hooks/
// useLeaveHousehold.ts and docs/DECISIONS.md ADR-034.
//
// Cache invalidation here is deliberately narrow (household_members list
// only) — this hook only ever removes a row belonging to someone OTHER
// than the caller, so there is no "own membership gone" case for it to
// handle; useLeaveHousehold.ts owns that for the leave path instead.

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
