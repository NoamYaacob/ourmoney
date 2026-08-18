// Thin wrapper over the set_recurring_transaction_active() RPC (migration
// 009, ADR-036) — the pause/resume one-tap action, split out from
// useUpdateRecurringTransaction.ts (see that file's comment).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'

export interface SetRecurringTransactionActiveInput {
  id: string
  expectedVersion: number
  isActive: boolean
}

export function useSetRecurringTransactionActive(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SetRecurringTransactionActiveInput): Promise<{ version: number }> => {
      const { data, error } = await supabase.rpc('set_recurring_transaction_active', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_is_active: input.isActive,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)

      return { version: result.version as number }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringTransactionsQueryKey(householdId) })
    },
  })
}
