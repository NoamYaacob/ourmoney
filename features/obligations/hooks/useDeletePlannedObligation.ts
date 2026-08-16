import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { plannedObligationsQueryKey } from './usePlannedObligations'

export function useDeletePlannedObligation(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (obligationId: string) => {
      const { error } = await supabase.from('planned_obligations').delete().eq('id', obligationId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plannedObligationsQueryKey(householdId) })
    },
  })
}
