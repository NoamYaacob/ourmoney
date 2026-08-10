import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { CategoryRuleField, CategoryRuleOperator } from '@/types/app'
import { categoryRulesQueryKey } from './useCategoryRules'

interface CreateCategoryRuleInput {
  householdId: string
  categoryId: string
  field: CategoryRuleField
  operator: CategoryRuleOperator
  value: string
  isCaseSensitive?: boolean
}

export function useCreateCategoryRule(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCategoryRuleInput) => {
      const { error } = await supabase.from('category_rules').insert({
        household_id: input.householdId,
        category_id: input.categoryId,
        field: input.field,
        operator: input.operator,
        value: input.value,
        is_case_sensitive: input.isCaseSensitive ?? false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryRulesQueryKey(householdId) })
    },
  })
}
