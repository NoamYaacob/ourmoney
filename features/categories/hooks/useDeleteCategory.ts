// categories_delete's RLS is admin-only and already blocks is_system=TRUE
// rows entirely — no client-side check needed to keep system categories safe.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { categoriesQueryKey } from './useCategories'

export function useDeleteCategory(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', categoryId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(householdId) })
    },
  })
}
