// Lean companion query to useAccounts.ts: fetches only account_id and
// amount_agorot for every transaction in the household (never `*` — this
// hook has no use for description/merchant/category/etc.) and reduces it to
// a per-account balance via computeAccountBalances, the pure function that
// is the only place this arithmetic happens
// (features/accounts/lib/computeAccountBalances.ts's own header explains
// why: accounts.balance_agorot is a dead column nothing writes to).
//
// Query key deliberately does NOT nest under ['transactions', householdId]
// (see features/transactions/hooks/useTransactions.ts's header comment on
// that prefix existing for Realtime invalidation) — this hook is not wired
// into useTransactionsRealtimeSync.ts, which is out of this fix's scope.
// The app's default 30s staleTime (lib/queryClient.ts) plus native
// refetch-on-focus keeps it reasonably fresh in the meantime, and
// useGenerateRecurringTransactions.ts explicitly invalidates
// accountBalancesQueryKey on every successful generation (a Safe-to-Spend
// consumer reading balances and recurring forecasts together cannot
// tolerate that staleness the way earlier consumers of this hook could).

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { computeAccountBalances } from '../lib/computeAccountBalances'

export function accountBalancesQueryKey(householdId: string | null | undefined) {
  return ['accounts', 'balances', householdId] as const
}

export function useAccountBalances(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: accountBalancesQueryKey(householdId),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('account_id, amount_agorot')
        .eq('household_id', householdId as string)
      if (error) throw error
      return computeAccountBalances(data)
    },
    enabled: !!householdId,
  })

  return {
    balances: query.data ?? {},
    isLoading: !!householdId && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
