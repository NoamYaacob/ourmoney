import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { savingsGoalsQueryKey } from './useSavingsGoals'

interface CreateSavingsGoalInput {
  householdId: string
  name: string
  targetAgorot: number
  accountId?: string | null
  targetDate?: string | null
  icon?: string | null
  color?: string | null
}

export function useCreateSavingsGoal(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateSavingsGoalInput) => {
      // is_completed is never sent — migration 003's
      // derive_savings_goal_completion trigger is the sole source of truth
      // for that column (current_agorot >= target_agorot, recomputed on
      // every write). A new goal always starts at current_agorot = 0 (the
      // column default), so the trigger derives is_completed = false unless
      // targetAgorot is somehow <= 0, which the DB's own
      // CHECK (target_agorot > 0) already forbids.
      const { error } = await supabase.from('savings_goals').insert({
        household_id: input.householdId,
        name: input.name,
        target_agorot: input.targetAgorot,
        account_id: input.accountId ?? null,
        target_date: input.targetDate ?? null,
        icon: input.icon ?? null,
        color: input.color ?? null,
        created_by: user?.id as string,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalsQueryKey(householdId) })
    },
  })
}
