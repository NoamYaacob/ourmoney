// The one hook that writes current_agorot. is_completed is never sent by
// this hook — it is derived exclusively by migration 003's
// derive_savings_goal_completion DB trigger (current_agorot >= target_agorot,
// BEFORE INSERT OR UPDATE, unconditional) and read back from the RPC's own
// result so this hook can compare it against the caller-supplied "was it
// completed before this write" flag.
//
// goal.completed fires ONLY on the false -> true transition of is_completed
// (per the approved M7 design): crossing upward emits it once; remaining
// above target on a later edit does not re-fire it; falling below target
// flips is_completed back to false with no event; crossing upward again
// afterward emits a fresh goal.completed. Every other progress change emits
// goal.progress_updated instead — both event types are declared in
// lib/events/types.ts since Milestone 1 with zero prior subscribers; this is
// their first real emitter.
//
// Thin wrapper over the update_savings_goal_progress() RPC (migration 009,
// ADR-036) — expectedVersion is mandatory, pinned at the same load moment
// app/(app)/goals/[id].tsx already snapshots from.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { savingsGoalsQueryKey } from './useSavingsGoals'

interface UpdateProgressInput {
  goalId: string
  expectedVersion: number
  householdId: string
  actorId: string | null
  currentAgorot: number
  wasCompleted: boolean
  targetAgorot: number
}

interface UpdateProgressResult extends VersionedMutationResult {
  currentAgorot?: number
  isCompleted?: boolean
}

export function useUpdateSavingsGoalProgress(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateProgressInput): Promise<{ version: number; currentAgorot: number; isCompleted: boolean }> => {
      const { data, error } = await supabase.rpc('update_savings_goal_progress', {
        p_id: input.goalId,
        p_expected_version: input.expectedVersion,
        p_current_agorot: input.currentAgorot,
      })
      if (error) throw error

      const result = data as unknown as UpdateProgressResult
      throwOnMutationFailure(result)

      return {
        version: result.version as number,
        currentAgorot: result.currentAgorot as number,
        isCompleted: result.isCompleted as boolean,
      }
    },
    onSuccess: (updated, variables) => {
      void queryClient.invalidateQueries({ queryKey: savingsGoalsQueryKey(householdId) })

      const occurredAt = new Date().toISOString()
      if (!variables.wasCompleted && updated.isCompleted) {
        emit({
          type: 'goal.completed',
          householdId: variables.householdId,
          actorId: variables.actorId,
          occurredAt,
          payload: { goalId: variables.goalId },
        })
      } else {
        emit({
          type: 'goal.progress_updated',
          householdId: variables.householdId,
          actorId: variables.actorId,
          occurredAt,
          payload: {
            goalId: variables.goalId,
            currentAgorot: updated.currentAgorot,
            targetAgorot: variables.targetAgorot,
          },
        })
      }
    },
  })
}
