// Thin wrapper over the generate_recurring_transactions() RPC (migration
// 003). No parameters — the RPC resolves the caller's household, locks
// every due active template (SELECT ... FOR UPDATE, stable id order),
// generates every missed occurrence per template sequentially, and advances
// each template's next_due_date entirely server-side. This hook sends
// nothing generation-specific; there is no client-computed payload to trust
// or distrust (the corrected M7 design — see the recurring-generation plan
// for why the earlier client-batch design was dropped).
//
// Triggers itself on mount and on every AppState foreground transition
// (mirroring ADR-003/Q2's "client-on-open" decision and reusing the same
// AppState pattern lib/queryClient.ts's focusManager wiring already
// established in Milestone 6) — the hook owns its own "when," the same way
// useTransactionsRealtimeSync.ts owns its own subscribe/unsubscribe
// lifecycle, so app/(app)/_layout.tsx only needs to mount it once. Safe to
// call repeatedly — see the RPC's own idempotency guarantee (row lock +
// re-read under READ COMMITTED).

import { useCallback, useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'

interface GenerateRecurringTransactionsResult {
  ok: boolean
  error?: string
  results?: { recurringId: string; transactionId: string; txnDate: string }[]
}

// types/database.ts is never hand-edited (CLAUDE.md) — only a real
// `supabase gen types` run against a live migration-003 database may add
// this RPC name to the generated Functions union. Until that regeneration
// happens, supabase.rpc's typed overload doesn't know this function name
// exists, so this one narrow, explicit cast stands in for it — remove once
// types/database.ts is regenerated.
const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: 'generate_recurring_transactions'
) => Promise<{ data: unknown; error: unknown }>

export function useGenerateRecurringTransactions(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await rpc('generate_recurring_transactions')
      if (error) throw error

      const result = data as unknown as GenerateRecurringTransactionsResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')
      return result
    },
    onSuccess: (result) => {
      if (!result.results || result.results.length === 0) return
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
      void queryClient.invalidateQueries({ queryKey: recurringTransactionsQueryKey(householdId) })
    },
  })

  const generate = useCallback(() => {
    if (!householdId || mutation.isPending) return
    mutation.mutate()
  }, [householdId, mutation])

  useEffect(() => {
    if (!householdId) return
    generate() // "app open"

    // Web has no AppState background/foreground concept the way RN does —
    // skipped there, matching lib/queryClient.ts's identical Platform check
    // for the same reason.
    if (Platform.OS === 'web') return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') generate()
    })
    return () => subscription.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId])

  return { generate, isPending: mutation.isPending, error: mutation.error }
}
