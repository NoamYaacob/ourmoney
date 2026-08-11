import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'
import type { RecurringFrequency } from '@/types/app'

export interface CreateRecurringTransactionInput {
  householdId: string
  accountId: string
  categoryId?: string | null
  amountAgorot: number
  description: string
  isShared: boolean
  frequency: RecurringFrequency
  dayOfMonth?: number | null
  nextDueDate: string
}

export function useCreateRecurringTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateRecurringTransactionInput) => {
      const { error } = await supabase.from('recurring_transactions').insert({
        household_id: input.householdId,
        account_id: input.accountId,
        category_id: input.categoryId ?? null,
        amount_agorot: input.amountAgorot,
        description: input.description,
        is_shared: input.isShared,
        frequency: input.frequency,
        day_of_month: input.dayOfMonth ?? null,
        next_due_date: input.nextDueDate,
        created_by: user?.id as string,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringTransactionsQueryKey(householdId) })
    },
  })
}
