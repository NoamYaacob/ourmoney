// Thin wrapper over the update_installment_plan() RPC (migration 016,
// ADR-037). Only description/merchant_name/category_id/is_shared are
// editable — every financial field (account_id, total_agorot,
// installment_count, monthly_agorot, first_charge_date) is permanently
// immutable once a plan is created, so this input shape intentionally
// carries none of them. expectedVersion is mandatory, same discipline as
// useUpdatePlannedObligation.ts.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { installmentPlansQueryKey } from './useInstallmentPlans'

export interface UpdateInstallmentPlanInput {
  id: string
  expectedVersion: number
  description: string
  merchantName: string | null
  categoryId: string | null
  isShared: boolean
}

export function useUpdateInstallmentPlan(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateInstallmentPlanInput): Promise<{ version: number }> => {
      const { data, error } = await supabase.rpc('update_installment_plan', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_description: input.description,
        p_merchant_name: input.merchantName,
        p_category_id: input.categoryId,
        p_is_shared: input.isShared,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)

      return { version: result.version as number }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: installmentPlansQueryKey(householdId) })
    },
  })
}
