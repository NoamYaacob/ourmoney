// Edits the goal's identity fields (name/target/date/account/icon/color) —
// NOT progress. Progress updates go through useUpdateSavingsGoalProgress.ts,
// which is the only hook that ever writes current_agorot and is the one
// responsible for detecting a completion transition. Kept as two separate
// hooks so this one never needs to reason about goal.completed/
// goal.progress_updated at all.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { savingsGoalsQueryKey } from './useSavingsGoals'

interface UpdateSavingsGoalInput {
  id: string
  name?: string
  targetAgorot?: number
  accountId?: string | null
  targetDate?: string | null
  icon?: string | null
  color?: string | null
}

export function useUpdateSavingsGoal(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name, targetAgorot, accountId, targetDate, icon, color }: UpdateSavingsGoalInput) => {
      const { error } = await supabase
        .from('savings_goals')
        .update({
          ...(name !== undefined && { name }),
          ...(targetAgorot !== undefined && { target_agorot: targetAgorot }),
          ...(accountId !== undefined && { account_id: accountId }),
          ...(targetDate !== undefined && { target_date: targetDate }),
          ...(icon !== undefined && { icon }),
          ...(color !== undefined && { color }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalsQueryKey(householdId) })
    },
  })
}
