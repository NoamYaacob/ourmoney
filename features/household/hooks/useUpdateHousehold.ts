// Settings' household rename affordance (PROJECT_SPEC.md § Household:
// "Admin can rename the household"). Plain UPDATE — households_update's RLS
// policy (migration 001) is already `is_household_admin(id)`, so this needs
// no RPC and no migration; the admin-only UI gate in the screen is purely to
// avoid showing a control the backend would reject, not the real boundary.
//
// Scoped by `id` (the household's own primary key), never by `user_id` — a
// household has exactly one row regardless of member count (ADR-006).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { householdQueryKey } from './useHousehold'

export function useUpdateHousehold(householdId: string | null | undefined, userId: string | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('households')
        .update({ name })
        .eq('id', householdId as string)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: householdQueryKey(userId) })
    },
  })
}
