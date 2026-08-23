// Thin wrapper over the generate_installment_transactions() RPC (migration
// 016, ADR-037) — a structural mirror of useGenerateRecurringTransactions.ts.
// No parameters: the RPC resolves the caller's household, row-locks every
// plan (SELECT ... FOR UPDATE, stable id order), and materializes every
// instalment whose charge date has already arrived, sequentially, entirely
// server-side.
//
// Must be mounted once at app load exactly like useGenerateRecurringTransactions
// (app/(app)/_layout.tsx) — forecastInstallmentOccurrences.ts's own
// double-count guard (never forecasting from installmentIndex 1, only from
// materializedCount + 1) depends on this running on every app load, the
// same load-bearing assumption recurring's forecaster already depends on.

import { useCallback, useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { accountBalancesQueryKey } from '@/features/accounts/hooks/useAccountBalances'
import { installmentPlansQueryKey } from './useInstallmentPlans'
import { installmentMaterializedCountsQueryKey } from './useInstallmentMaterializedCounts'

interface GenerateInstallmentTransactionsResult {
  ok: boolean
  error?: string
  results?: { installmentPlanId: string; transactionId: string; installmentIndex: number; txnDate: string }[]
}

export function useGenerateInstallmentTransactions(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('generate_installment_transactions')
      if (error) throw error

      const result = data as unknown as GenerateInstallmentTransactionsResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')
      return result
    },
    onSuccess: (result) => {
      if (!result.results || result.results.length === 0) return
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
      void queryClient.invalidateQueries({ queryKey: installmentPlansQueryKey(householdId) })
      void queryClient.invalidateQueries({ queryKey: installmentMaterializedCountsQueryKey(householdId) })
      // Each materialized instalment is a real expense transaction against a
      // real credit-card account — useAccountBalances must be invalidated in
      // the same breath, matching useGenerateRecurringTransactions.ts's own
      // reasoning for why this can't be skipped.
      void queryClient.invalidateQueries({ queryKey: accountBalancesQueryKey(householdId) })
    },
  })

  const generate = useCallback(() => {
    if (!householdId || mutation.isPending) return
    mutation.mutate()
  }, [householdId, mutation])

  useEffect(() => {
    if (!householdId) return
    generate() // "app open"

    if (Platform.OS === 'web') return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') generate()
    })
    return () => subscription.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  return { generate, isPending: mutation.isPending, error: mutation.error }
}
