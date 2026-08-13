import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { categoriesQueryKey } from './useCategories'

interface UpdateCategoryInput {
  id: string
  nameHe: string
}

export function useUpdateCategory(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateCategoryInput) => {
      const { error } = await supabase.from('categories').update({ name_he: input.nameHe }).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(householdId) })
    },
  })
}
