// Thin wrapper over the skip_recurring_occurrence() RPC (migration 003) —
// advances a single template's next_due_date by exactly one period, with no
// transaction generated. All date math is server-side (advance_recurring_
// due_date(), the same function generate_recurring_transactions() uses) —
// this hook sends nothing but the template id.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'

interface SkipRecurringOccurrenceResult {
  ok: boolean
  newNextDueDate?: string
  error?: string
}

// types/database.ts is never hand-edited (CLAUDE.md) — see the identical
// comment in useGenerateRecurringTransactions.ts. This cast is temporary,
// pending a real `supabase gen types` run against migration 003.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: 'skip_recurring_occurrence',
  args: { p_recurring_id: string }
) => Promise<{ data: unknown; error: unknown }>

export function useSkipRecurringOccurrence(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (recurringId: string) => {
      const { data, error } = await rpc('skip_recurring_occurrence', { p_recurring_id: recurringId })
      if (error) throw error

      const result = data as unknown as SkipRecurringOccurrenceResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')
      return result
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringTransactionsQueryKey(householdId) })
    },
  })
}
