// categories_delete's RLS is admin-only and already blocks is_system=TRUE
// rows entirely — no client-side check needed to keep system categories safe.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { categoriesQueryKey } from './useCategories'
import { categoryRulesQueryKey } from './useCategoryRules'

export function useDeleteCategory(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(householdId) })
      // category_rules.category_id is ON DELETE CASCADE (migration 002) —
      // deleting a category deletes its rules server-side in the same
      // statement. Without also invalidating this key, the Rules card kept
      // showing the now-orphaned rule (its "THEN" line rendering `undefined`
      // for the deleted category's name) until something else happened to
      // refetch it — a real, reproducible stale-UI bug, not just staleness.
      void queryClient.invalidateQueries({ queryKey: categoryRulesQueryKey(householdId) })
    },
  })
}
