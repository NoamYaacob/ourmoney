// Thin wrapper over the delete_savings_goal() RPC (migration 009, ADR-036)
// — version-gated exactly like update, since a stale delete is irreversible.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { savingsGoalsQueryKey } from './useSavingsGoals'

export interface DeleteSavingsGoalInput {
  id: string
  expectedVersion: number
}

export function useDeleteSavingsGoal(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DeleteSavingsGoalInput): Promise<void> => {
      const { data, error } = await supabase.rpc('delete_savings_goal', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalsQueryKey(householdId) })
    },
  })
}
