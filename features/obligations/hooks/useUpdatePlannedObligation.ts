// Thin wrapper over the update_planned_obligation() RPC (migration 009,
// ADR-036). Every identity field is required on every call — like
// useUpdateTransfer.ts, this is one coherent edit, not an independently
// patchable field set — and expectedVersion is mandatory: the caller must
// pass the version it loaded (pinned at the same startEditing() snapshot
// moment app/(app)/obligations/[id].tsx already uses), never the live query
// result, or the whole compare-and-swap is defeated.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { plannedObligationsQueryKey } from './usePlannedObligations'

export interface UpdatePlannedObligationInput {
  id: string
  expectedVersion: number
  name: string
  amountAgorot: number
  dueDate: string
  categoryId: string | null
  accountId: string | null
  isShared: boolean
  notes: string | null
}

export function useUpdatePlannedObligation(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdatePlannedObligationInput): Promise<{ version: number }> => {
      const { data, error } = await supabase.rpc('update_planned_obligation', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_name: input.name,
        p_amount_agorot: input.amountAgorot,
        p_due_date: input.dueDate,
        p_category_id: input.categoryId,
        p_account_id: input.accountId,
        p_is_shared: input.isShared,
        p_notes: input.notes,
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
