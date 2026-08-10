import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useHouseholdStore } from '@/store/householdStore'
import { clearPendingInvitationToken } from '@/features/household/lib/pendingInvitationToken'

export function useSignOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
    onSuccess: () => {
      // A stale householdId (or cached household data) must not survive
      // into whatever the next signed-in user on this device sees — not a
      // data leak (RLS still scopes every real read regardless of what this
      // client-side copy says), but a real correctness/UX bug now that
      // store/householdStore.ts has real writers. removeQueries with a
      // 2-element key does a prefix match, catching every userId-suffixed
      // key written by features/auth/hooks/useHasHousehold.ts's
      // householdMembershipQueryKey(userId) and
      // features/household/hooks/useHousehold.ts's householdQueryKey(userId)
      // — the specific userId isn't reliably available here since the
      // session is already gone by the time this fires.
      useHouseholdStore.getState().setHouseholdId(null)
      void queryClient.removeQueries({ queryKey: ['household', 'current'] })
      void queryClient.removeQueries({ queryKey: ['auth', 'household-membership'] })

      // A pending invitation token stored by whoever was using this device
      // before must not be silently inherited by the next person who signs
      // in — without this, a shared/family device (a real scenario per
      // ADR-006) could auto-join an unrelated account to a household nobody
      // on that account agreed to join (adversarial review finding).
      void clearPendingInvitationToken(queryClient)
    },
  })
}
