import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { RecurringTransaction } from '@/types/app'

export function recurringTransactionsQueryKey(householdId: string | null | undefined) {
  return ['recurringTransactions', householdId] as const
}

export function useRecurringTransactions(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: recurringTransactionsQueryKey(householdId),
    queryFn: async (): Promise<RecurringTransaction[]> => {
      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('*')
        .eq('household_id', householdId as string)
        .order('next_due_date', { ascending: true })
      if (error) throw error
      return data as RecurringTransaction[]
    },
    enabled: !!householdId,
  })

  return {
    recurringTransactions: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    // Exposed for the detail screen's conflict-recovery flow — see
    // usePlannedObligations.ts's identical export for the reasoning.
    refetch: query.refetch,
  }
}
