// Thin wrapper over the delete_installment_plan() RPC (migration 016,
// ADR-037) — version-gated like every other delete RPC in this codebase.
// Deleting a plan does not delete its already-materialized instalment
// transactions (installment_plan_id survives as historical metadata via
// ON DELETE SET NULL, same as useDeletePlannedObligation.ts's
// obligation_id precedent) — only future, not-yet-materialized instalments
// stop being forecast or generated.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { installmentPlansQueryKey } from './useInstallmentPlans'

export interface DeleteInstallmentPlanInput {
  id: string
  expectedVersion: number
}

export function useDeleteInstallmentPlan(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DeleteInstallmentPlanInput): Promise<void> => {
      const { data, error } = await supabase.rpc('delete_installment_plan', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: installmentPlansQueryKey(householdId) })
    },
  })
}
