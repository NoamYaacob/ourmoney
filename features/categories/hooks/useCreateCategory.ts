import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { categoriesQueryKey } from './useCategories'

interface CreateCategoryInput {
  householdId: string
  nameHe: string
  icon?: string
  color?: string
  isIncome?: boolean
}

export function useCreateCategory(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCategoryInput) => {
      const { error } = await supabase.from('categories').insert({
        household_id: input.householdId,
        name_he: input.nameHe,
        icon: input.icon,
        color: input.color,
        is_income: input.isIncome ?? false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(householdId) })
    },
  })
}
