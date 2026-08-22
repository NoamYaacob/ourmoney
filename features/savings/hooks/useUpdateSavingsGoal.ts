// Edits the goal's identity fields (name/target/date/account/icon/color) —
// NOT progress. Progress updates go through useUpdateSavingsGoalProgress.ts,
// which is the only hook that ever writes current_agorot and is the one
// responsible for detecting a completion transition. Kept as two separate
// hooks so this one never needs to reason about goal.completed/
// goal.progress_updated at all.
//
// Thin wrapper over the update_savings_goal() RPC (migration 009, ADR-036).
// All identity fields are required on every call, and expectedVersion is
// mandatory — pinned at the same loadedGoalId-guarded snapshot moment
// app/(app)/goals/[id].tsx already uses.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import type { SavingsGoalProgressSource } from '@/types/app'
import { savingsGoalsQueryKey } from './useSavingsGoals'

export interface UpdateSavingsGoalInput {
  id: string
  expectedVersion: number
  name: string
  targetAgorot: number
  accountId: string | null
  targetDate: string | null
  icon: string | null
  color: string | null
  progressSource: SavingsGoalProgressSource
}

export function useUpdateSavingsGoal(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateSavingsGoalInput): Promise<{ version: number }> => {
      const { data, error } = await supabase.rpc('update_savings_goal', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_name: input.name,
        p_target_agorot: input.targetAgorot,
        p_account_id: input.accountId,
        p_target_date: input.targetDate,
        p_icon: input.icon,
        p_color: input.color,
        p_progress_source: input.progressSource,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)

      return { version: result.version as number }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalsQueryKey(householdId) })
    },
  })
}
