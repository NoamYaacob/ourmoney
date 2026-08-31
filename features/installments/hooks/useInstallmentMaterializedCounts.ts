// Lean companion query to useInstallmentPlans.ts, mirroring
// useAccountBalances.ts's own pattern exactly: fetches installment_plan_id +
// installment_index for every transaction in the household and reduces it
// to two DIFFERENT per-plan values from the one query result — a row COUNT
// (for display: "3 of 12 paid") and a MAX index (for forecasting: "what
// index should resume next"). These must stay two separate values, not one
// — see computeInstallmentMaterializedCounts.ts's header comment for why a
// deleted materialized instalment makes them diverge, and why forecasting
// specifically needs the gap-safe MAX (RRR §14 P0-1).

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { diagnoseQuery } from '@/lib/diagnostics/queryDiagnostics'
import {
  computeInstallmentMaterializedCounts,
  computeInstallmentMaxIndices,
} from '../lib/computeInstallmentMaterializedCounts'

interface InstallmentMaterializedRow {
  installment_plan_id: string | null
  installment_index: number | null
}

interface InstallmentMaterializedData {
  counts: Record<string, number>
  maxIndices: Record<string, number>
}

export function installmentMaterializedCountsQueryKey(householdId: string | null | undefined) {
  return ['installmentPlans', 'materializedCounts', householdId] as const
}

export function useInstallmentMaterializedCounts(householdId: string | null | undefined) {
  const query = useQuery({
    queryKey: installmentMaterializedCountsQueryKey(householdId),
    queryFn: async (): Promise<InstallmentMaterializedData> => {
      const { data, error } = await diagnoseQuery(
        'useInstallmentMaterializedCounts',
        'transactions',
        'select',
        { householdId },
        () =>
          supabase
            .from('transactions')
            .select('installment_plan_id, installment_index')
            .eq('household_id', householdId as string)
            .not('installment_plan_id', 'is', null)
      )
      if (error) throw error
      const rows = data as InstallmentMaterializedRow[]
      return {
        counts: computeInstallmentMaterializedCounts(rows),
        maxIndices: computeInstallmentMaxIndices(rows),
      }
    },
    enabled: !!householdId,
  })

  return {
    // Row count — display purposes only ("3 of 12 paid", remaining balance).
    // Never feed this into forecasting; see the header comment above.
    materializedCounts: query.data?.counts ?? {},
    // MAX(installment_index) per plan — the only gap-safe basis for "what
    // index should forecasting resume from." Feed this, not
    // materializedCounts, into anything that calls
    // forecastInstallmentOccurrences (directly or via assembleForecastInputs).
    maxMaterializedIndices: query.data?.maxIndices ?? {},
    isLoading: !!householdId && query.isPending,
    error: query.error,
    // See features/accounts/hooks/useAccounts.ts's identical field: `data`
    // survives a failed background refetch, so this is the only reliable
    // "never loaded" signal distinct from `error`.
    hasData: query.data !== undefined,
    refetch: query.refetch,
  }
}
