// Thin wrapper over the delete_planned_obligation() RPC (migration 009,
// ADR-036) — a stale delete is irreversible, so it is version-gated exactly
// like update: the caller must pass the version it last saw.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { plannedObligationsQueryKey } from './usePlannedObligations'

export interface DeletePlannedObligationInput {
  id: string
  expectedVersion: number
}

export function useDeletePlannedObligation(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DeletePlannedObligationInput): Promise<void> => {
      const { data, error } = await supabase.rpc('delete_planned_obligation', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plannedObligationsQueryKey(householdId) })
    },
  })
}
