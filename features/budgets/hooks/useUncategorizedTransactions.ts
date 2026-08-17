// Extracted from app/(app)/budgets/index.tsx (architecture rule: no direct
// Supabase calls in screen files, ever — CLAUDE.md § Component Architecture)
// — the uncategorized-transactions queue for the current household.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function uncategorizedTransactionsQueryKey(householdId: string | null | undefined) {
  return ['transactions', householdId, 'uncategorized'] as const
}

export function useUncategorizedTransactions(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: uncategorizedTransactionsQueryKey(householdId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, description, amount_agorot, txn_date')
        .eq('household_id', householdId as string)
        .is('category_id', null)
        // Migration 008 (ADR-035): a transfer leg's category_id is always
        // NULL by design (it is never "uncategorized," it is never
        // categorizable at all) — without this it would surface here
        // permanently, since nothing can ever assign it a category.
        .is('transfer_id', null)
        .order('txn_date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!householdId,
  })

  return {
    uncategorized: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    // Exposed so callers can distinguish a genuinely empty queue from a
    // failed fetch — data falls back to [] on error, which would otherwise
    // render the same "all categorized" success state as a real empty
    // queue (see app/(app)/budgets/index.tsx's uncategorizedError branch).
    error: query.error,
  }
}
