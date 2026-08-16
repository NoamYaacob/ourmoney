// Query key deliberately nests filters UNDER the ['transactions', householdId]
// prefix so Realtime invalidation (useTransactionsRealtimeSync.ts) can
// invalidate every filtered variant at once via TanStack Query's prefix
// matching — see ARCHITECTURE.md's literal
// invalidateQueries(['transactions', householdId]) instruction.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Transaction } from '@/types/app'

export interface TransactionFilters {
  accountId?: string
  categoryId?: string
  // Mutually exclusive with categoryId (the Transactions list filter UI
  // never sets both) — category_id IS NULL, the exact same predicate
  // "uncategorized" means everywhere else in this codebase.
  uncategorized?: boolean
  periodStart?: string
  periodEnd?: string
  isShared?: boolean
}

export function transactionsQueryKey(householdId: string | null | undefined, filters?: TransactionFilters) {
  return ['transactions', householdId, filters ?? {}] as const
}

export function useTransactions(householdId: string | null | undefined, filters: TransactionFilters = {}) {
  const query = useQuery({
    queryKey: transactionsQueryKey(householdId, filters),
    queryFn: async (): Promise<Transaction[]> => {
      let request = supabase
        .from('transactions')
        .select('*')
        .eq('household_id', householdId as string)
        .order('txn_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.accountId) request = request.eq('account_id', filters.accountId)
      if (filters.uncategorized) request = request.is('category_id', null)
      else if (filters.categoryId) request = request.eq('category_id', filters.categoryId)
      if (filters.periodStart) request = request.gte('txn_date', filters.periodStart)
      if (filters.periodEnd) request = request.lte('txn_date', filters.periodEnd)
      if (filters.isShared !== undefined) request = request.eq('is_shared', filters.isShared)

      const { data, error } = await request
      if (error) throw error
      return data as Transaction[]
    },
    enabled: !!householdId,
  })

  return {
    transactions: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
  }
}

// Bypasses the TanStack Query cache entirely — deliberately NOT
// `queryClient.fetchQuery`, which would honor staleTime and could still
// return a stale cached page for this exact query key. Used only for the
// CSV import commit-time duplicate re-check (app/(app)/transactions/import.tsx),
// where "fresh" must mean "just queried the server right now," not "not
// too stale." A normal immediate second import in the same client session
// must see the first import's just-written rows, which a staleTime-aware
// cache read cannot guarantee.
export async function fetchFreshTransactionsForAccount(
  householdId: string,
  accountId: string
): Promise<Pick<Transaction, 'account_id' | 'txn_date' | 'amount_agorot' | 'description'>[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('account_id, txn_date, amount_agorot, description')
    .eq('household_id', householdId)
    .eq('account_id', accountId)
  if (error) throw error
  return data ?? []
}
