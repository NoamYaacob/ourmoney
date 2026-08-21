// Thin wrapper over the complete_planned_obligation() RPC (migration 012) —
// the "mark paid, also record a transaction" path. Design-stage review
// required this be its own RPC/hook rather than folded into
// useSetPlannedObligationStatus.ts: the toggle-OFF path (mark paid, no
// transaction) keeps using that existing hook unchanged; this one is only
// called when the household member opts into creating a linked transaction.
//
// Emits 'transaction.created' itself, after the RPC succeeds — domain
// events are emitted by application code, never by SQL (CLAUDE.md "Domain
// Events — Emit, Never Call"), mirroring
// features/transactions/hooks/useCreateTransaction.ts's own emit call
// exactly, so budget-threshold subscribers and every other transaction.
// created listener react to an obligation-derived transaction exactly like
// a manually-entered one.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { emit } from '@/lib/events/dispatcher'
import { throwOnMutationFailure, type VersionedMutationResult } from '@/lib/mutations/concurrencyError'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { plannedObligationsQueryKey } from './usePlannedObligations'

export interface CompletePlannedObligationWithTransactionInput {
  id: string
  expectedVersion: number
  accountId: string
  categoryId: string | null
  amountAgorot: number
  isShared: boolean
}

interface CompleteResult extends VersionedMutationResult {
  transaction_id?: string | null
}

export function useCompletePlannedObligationWithTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CompletePlannedObligationWithTransactionInput): Promise<{ version: number; transactionId: string }> => {
      const { data, error } = await supabase.rpc('complete_planned_obligation', {
        p_id: input.id,
        p_expected_version: input.expectedVersion,
        p_create_transaction: true,
        p_account_id: input.accountId,
      })
      if (error) throw error

      const result = data as unknown as CompleteResult
      throwOnMutationFailure(result)
      // Not reachable when p_create_transaction=true and the RPC returned
      // ok:true (the RPC always inserts a row and returns its id in that
      // case) — narrowed here only so the return type stays non-nullable.
      if (!result.transaction_id) throw new Error('unknown_error')

      return { version: result.version as number, transactionId: result.transaction_id }
    },
    onSuccess: (data, input) => {
      void queryClient.invalidateQueries({ queryKey: plannedObligationsQueryKey(householdId) })
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })

      if (!householdId) return
      emit({
        type: 'transaction.created',
        householdId,
        actorId: user?.id ?? null,
        occurredAt: new Date().toISOString(),
        payload: {
          transactionId: data.transactionId,
          accountId: input.accountId,
          categoryId: input.categoryId,
          amountAgorot: -input.amountAgorot,
          isShared: input.isShared,
          txnDate: localDateString(),
        },
      })
    },
  })
}
