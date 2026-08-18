// Thin wrapper over the delete_recurring_transaction() RPC (migration 009,
// ADR-036) — version-gated like every other delete in this milestone, even
// though this table's UPDATE stays RLS-open (ADR-036 §5): delete has no
// competing system writer, so it is closed the same way as the other two
// tables.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'

export interface DeleteRecurringTransactionInput {
  id: string
  expectedVersion: number
}

export function useDeleteRecurringTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: DeleteRecurringTransactionInput): Promise<void> => {
      const { data, error } = await supabase.rpc('delete_recurring_transaction', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
      })
      if (error) throw error

      const result = data as unknown as VersionedMutationResult
      throwOnMutationFailure(result)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringTransactionsQueryKey(householdId) })
    },
  })
}
