import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { CategoryRule } from '@/types/app'

export function categoryRulesQueryKey(householdId: string | null | undefined) {
  return ['categoryRules', householdId] as const
}

export function useCategoryRules(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: categoryRulesQueryKey(householdId),
    queryFn: async (): Promise<CategoryRule[]> => {
      const { data, error } = await supabase
        .from('category_rules')
        .select('*')
        .eq('household_id', householdId as string)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data as CategoryRule[]
    },
    enabled: !!householdId,
  })

  return {
    rules: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
  }
}
