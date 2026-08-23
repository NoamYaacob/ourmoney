// Direct .insert() — installment_plans' INSERT RLS policy is open to
// household members (with D2 coherence + credit_card-type account check),
// the same reason planned_obligations/savings_goals creation also stays a
// direct client insert rather than an RPC. UPDATE/DELETE are the ones
// closed to RPCs (migration 016's REVOKE ALL) since those touch immutable
// financial fields.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { installmentPlansQueryKey } from './useInstallmentPlans'

interface CreateInstallmentPlanInput {
  householdId: string
  accountId: string
  categoryId?: string | null
  merchantName?: string | null
  description: string
  totalAgorot: number
  installmentCount: number
  firstChargeDate: string
  isShared: boolean
}

export function useCreateInstallmentPlan(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateInstallmentPlanInput) => {
      // Matches the CHECK on installment_plans.monthly_agorot exactly
      // (total_agorot / installment_count via integer division) and
      // generate_installment_transactions()'s own remainder-absorption math
      // — the last instalment, not this stored value, carries the leftover.
      const monthlyAgorot = Math.floor(input.totalAgorot / input.installmentCount)

      const { error } = await supabase.from('installment_plans').insert({
        household_id: input.householdId,
        account_id: input.accountId,
        category_id: input.categoryId ?? null,
        merchant_name: input.merchantName ?? null,
        description: input.description,
        total_agorot: input.totalAgorot,
        installment_count: input.installmentCount,
        monthly_agorot: monthlyAgorot,
        first_charge_date: input.firstChargeDate,
        is_shared: input.isShared,
        created_by: user?.id as string,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: installmentPlansQueryKey(householdId) })
    },
  })
}
