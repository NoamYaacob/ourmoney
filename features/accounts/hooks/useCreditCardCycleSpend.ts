// Supabase-aware composition layer only, mirroring useAccountBalances.ts's
// own lean-query pattern: fetches only the columns
// computeCurrentCycleSpendAgorot needs for one credit_card account, then
// calls the pure functions in features/accounts/lib/creditCardCycle.ts.
// Returns null (not 0) when the account has no billing_cycle_day set —
// "no current cycle to show" is a distinct state from "spent nothing."

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { computeCurrentCycleSpendAgorot, getCurrentBillingCycleRange } from '../lib/creditCardCycle'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'

export function creditCardCycleSpendQueryKey(accountId: string | null | undefined) {
  return ['accounts', 'creditCardCycleSpend', accountId] as const
}

export function useCreditCardCycleSpend(accountId: string | null | undefined, billingCycleDay: number | null) {
  const query = useQuery({
    queryKey: creditCardCycleSpendQueryKey(accountId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount_agorot, txn_date, transfer_id, is_excluded')
        .eq('account_id', accountId as string)
      if (error) throw error
      return data
    },
    enabled: !!accountId && billingCycleDay !== null,
  })

  if (billingCycleDay === null) {
    return { spendAgorot: null, range: null, isLoading: false, error: null, hasData: false }
  }

  const range = getCurrentBillingCycleRange(billingCycleDay, localDateString())
  const spendAgorot = query.data ? computeCurrentCycleSpendAgorot(query.data, range) : null

  return {
    spendAgorot,
    range,
    isLoading: !!accountId && query.isPending,
    error: query.error,
    // See features/accounts/hooks/useAccounts.ts's identical field: `data`
    // survives a failed background refetch, so this is the only reliable
    // "never loaded" signal distinct from `error`.
    hasData: query.data !== undefined,
  }
}
