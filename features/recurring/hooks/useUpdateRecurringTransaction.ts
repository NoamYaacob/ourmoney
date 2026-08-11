import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'
import type { RecurringFrequency } from '@/types/app'

export interface UpdateRecurringTransactionInput {
  id: string
  accountId?: string
  categoryId?: string | null
  amountAgorot?: number
  description?: string
  isShared?: boolean
  frequency?: RecurringFrequency
  dayOfMonth?: number | null
  isActive?: boolean
}

// next_due_date is deliberately NOT editable here — it is only ever advanced
// by generate_recurring_transactions()/skip_recurring_occurrence() (both
// server-authoritative, see migration 003), never set directly by a client
// edit, so a template's cursor can't be hand-moved around the generation
// guard.
export function useUpdateRecurringTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      accountId,
      categoryId,
      amountAgorot,
      description,
      isShared,
      frequency,
      dayOfMonth,
      isActive,
    }: UpdateRecurringTransactionInput) => {
      const { error } = await supabase
        .from('recurring_transactions')
        .update({
          ...(accountId !== undefined && { account_id: accountId }),
          ...(categoryId !== undefined && { category_id: categoryId }),
          ...(amountAgorot !== undefined && { amount_agorot: amountAgorot }),
          ...(description !== undefined && { description }),
          ...(isShared !== undefined && { is_shared: isShared }),
          ...(frequency !== undefined && { frequency }),
          ...(dayOfMonth !== undefined && { day_of_month: dayOfMonth }),
          ...(isActive !== undefined && { is_active: isActive }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringTransactionsQueryKey(householdId) })
    },
  })
}
