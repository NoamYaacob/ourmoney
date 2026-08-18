import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { CategoryRuleField, CategoryRuleOperator } from '@/types/app'
import { categoryRulesQueryKey } from './useCategoryRules'

interface UpdateCategoryRuleInput {
  id: string
  categoryId: string
  field: CategoryRuleField
  operator: CategoryRuleOperator
  value: string
}

export function useUpdateCategoryRule(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateCategoryRuleInput) => {
      const { error } = await supabase
        .from('category_rules')
        .update({
          category_id: input.categoryId,
          field: input.field,
          operator: input.operator,
          value: input.value,
        })
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryRulesQueryKey(householdId) })
    },
  })
}
