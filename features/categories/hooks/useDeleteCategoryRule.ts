import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { categoryRulesQueryKey } from './useCategoryRules'

export function useDeleteCategoryRule(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await supabase.from('category_rules').delete().eq('id', ruleId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: categoryRulesQueryKey(householdId) })
    },
  })
}
