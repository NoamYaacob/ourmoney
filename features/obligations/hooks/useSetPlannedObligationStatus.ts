// Thin wrapper over the set_planned_obligation_status() RPC (migration 009,
// ADR-036) — the mark-paid/cancel one-tap actions. Split out from
// useUpdatePlannedObligation.ts the same way useUpdateSavingsGoalProgress.ts
// is split from useUpdateSavingsGoal.ts: a narrow, single-field mutation
// with its own compare-and-swap, so the identity-edit hook never has to
// reason about status transitions.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { plannedObligationsQueryKey } from './usePlannedObligations'
import type { PlannedObligationStatus } from '@/types/app'

export interface SetPlannedObligationStatusInput {
  id: string
  expectedVersion: number
  status: PlannedObligationStatus
}

export function useSetPlannedObligationStatus(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SetPlannedObligationStatusInput): Promise<{ version: number }> => {
      const { data, error } = await supabase.rpc('set_planned_obligation_status', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_status: input.status,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)

      return { version: result.version as number }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plannedObligationsQueryKey(householdId) })
    },
  })
}
