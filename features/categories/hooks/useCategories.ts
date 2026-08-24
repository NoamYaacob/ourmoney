// One query returns system (household_id IS NULL) + this household's custom
// categories combined — categories_select's RLS already returns both in one
// SELECT, so there is no separate "system categories" query.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Category } from '@/types/app'

export function categoriesQueryKey(householdId: string | null | undefined) {
  return ['categories', householdId] as const
}

export function useCategories(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: categoriesQueryKey(householdId),
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .or(`household_id.eq.${householdId as string},household_id.is.null`)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!householdId,
  })

  return {
    categories: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
