import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { savingsGoalsQueryKey } from './useSavingsGoals'

export function useDeleteSavingsGoal(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (goalId: string) => {
      const { error } = await supabase.from('savings_goals').delete().eq('id', goalId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalsQueryKey(householdId) })
    },
  })
}
