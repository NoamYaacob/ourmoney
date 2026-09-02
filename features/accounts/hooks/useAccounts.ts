// Takes householdId as a plain parameter, never reads store/householdStore.ts
// directly — the same discipline useHouseholdMembers.ts documents. Callers
// MUST source householdId from useHousehold(user?.id)'s live return value.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { diagnoseQuery } from '@/lib/diagnostics/queryDiagnostics'
import type { Account } from '@/types/app'

export function accountsQueryKey(householdId: string | null | undefined) {
  return ['accounts', householdId] as const
}

export function useAccounts(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: accountsQueryKey(householdId),
    queryFn: async (): Promise<Account[]> => {
      // diagnoseQuery is a zero-overhead passthrough unless a developer has
      // explicitly opted in (see lib/diagnostics/queryDiagnostics.ts) — do
      // not remove without checking that file's own header for why it's
      // temporarily here.
      const { data, error } = await diagnoseQuery('useAccounts', 'accounts', 'select', { householdId }, () =>
        supabase.from('accounts').select('*').eq('household_id', householdId as string).order('created_at', { ascending: true })
      )
      if (error) throw error
      return data as Account[]
    },
    enabled: !!householdId,
  })

  return {
    accounts: query.data ?? [],
    isLoading: !!householdId && query.isPending,
    error: query.error,
    // True once this query has ever resolved with data, independent of
    // `error` — TanStack Query keeps `query.data` at its last successful
    // value through a failed background refetch (only `status`/`error`
    // flip), so this is the only reliable way for a caller to tell "never
    // loaded, nothing to show" apart from "loaded before, this refetch just
    // failed, what we have is still good." See docs/KNOWN_ISSUES.md-adjacent
    // fix for the Home/Cash Flow "successful data → blank/error" bug this
    // exists to prevent.
    hasData: query.data !== undefined,
    // Exposed so a failed fetch has a real retry path — see
    // usePlannedObligations.ts's identical export for the reasoning.
    refetch: query.refetch,
  }
}
