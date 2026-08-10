// Thin wrapper over the save_budget_allocations() RPC (D3) — true replace,
// atomic. No client-side "insert budget, then insert N allocations" split;
// that split is exactly the orphaned-parent-row risk the RPC exists to
// avoid.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { budgetProgressQueryKey } from './useBudgetProgress'

export interface AllocationInput {
  categoryId: string
  amountAgorot: number
}

interface SaveBudgetAllocationsResult {
  ok: boolean
  budget_id?: string
  error?: string
}

export function useSaveBudgetAllocations(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ periodStart, allocations }: { periodStart: string; allocations: AllocationInput[] }) => {
      const { data, error } = await supabase.rpc('save_budget_allocations', {
        p_period_start: periodStart,
        p_allocations: allocations.map((a) => ({ categoryId: a.categoryId, amountAgorot: String(a.amountAgorot) })),
      })
      if (error) throw error

      const result = data as unknown as SaveBudgetAllocationsResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')
      return result
    },
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: budgetProgressQueryKey(householdId, variables.periodStart) })
    },
  })
}
