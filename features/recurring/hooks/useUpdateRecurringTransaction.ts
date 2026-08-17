// Thin wrapper over the update_recurring_transaction() RPC (migration 009,
// ADR-036). All identity fields are required on every call, and
// expectedVersion is mandatory — pinned at the same startEditing() snapshot
// moment app/(app)/recurring/[id].tsx already uses. is_active is
// deliberately NOT handled here — see useSetRecurringTransactionActive.ts,
// split out the same way useUpdateSavingsGoal/useUpdateSavingsGoalProgress
// already are, so this hook never has to reason about pause/resume.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'
import type { RecurringFrequency } from '@/types/app'

export interface UpdateRecurringTransactionInput {
  id: string
  expectedVersion: number
  accountId: string
  categoryId: string | null
  amountAgorot: number
  description: string
  isShared: boolean
  frequency: RecurringFrequency
  dayOfMonth: number | null
}

// next_due_date is deliberately NOT editable here — it is only ever advanced
// by generate_recurring_transactions()/skip_recurring_occurrence() (both
// server-authoritative, see migration 003), never set directly by a client
// edit, so a template's cursor can't be hand-moved around the generation
// guard.
export function useUpdateRecurringTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateRecurringTransactionInput): Promise<{ version: number }> => {
      const { data, error } = await supabase.rpc('update_recurring_transaction', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_account_id: input.accountId,
        p_category_id: input.categoryId,
        p_amount_agorot: input.amountAgorot,
        p_description: input.description,
        p_is_shared: input.isShared,
        p_frequency: input.frequency,
        p_day_of_month: input.dayOfMonth,
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
