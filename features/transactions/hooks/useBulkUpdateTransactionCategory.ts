// Bulk manual category assignment (Transactions screen selection mode).
// A SINGLE Supabase UPDATE ... WHERE id IN (...) — deliberately not N
// sequential calls through useUpdateTransaction.ts. See this milestone's
// report for the full architecture decision; summary: RLS's
// transactions_update policy (migration 006) applies per row regardless of
// how many rows one UPDATE statement touches, so batching doesn't weaken
// authorization, and a single UPDATE statement is atomic in Postgres —
// either every matched row is written together or (on any error) none are.
// There is no partial-failure state to fake: `missingIds` below is not a
// failure, it's an honest count of selected ids the statement genuinely
// didn't touch (e.g. a row someone else deleted between selection and
// submit) — distinct from a thrown error, which means the whole statement
// failed and nothing changed.
//
// Reuses the exact matched_rule_id invariant useUpdateTransaction.ts
// already encodes — "category_id: fields.categoryId, matched_rule_id:
// null" whenever categoryId is included — rather than reinventing it here.
// This bulk action is always a manual override by construction (it never
// re-runs rule matching), so clearing matched_rule_id is unconditional.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { transactionQueryKey } from './useTransaction'

export interface BulkUpdateTransactionCategoryInput {
  householdId: string
  transactionIds: string[]
  categoryId: string | null
}

export interface BulkUpdateTransactionCategoryResult {
  updatedIds: string[]
  // Selected ids the UPDATE did not touch. See this file's header comment
  // — not a thrown error, but still surfaced honestly rather than folded
  // into a false "all succeeded."
  missingIds: string[]
}

export function useBulkUpdateTransactionCategory(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: BulkUpdateTransactionCategoryInput): Promise<BulkUpdateTransactionCategoryResult> => {
      if (input.transactionIds.length === 0) return { updatedIds: [], missingIds: [] }

      const { data, error } = await supabase
        .from('transactions')
        .update({ category_id: input.categoryId, matched_rule_id: null })
        .in('id', input.transactionIds)
        .eq('household_id', input.householdId)
        .select('id')
      if (error) throw error

      const updatedIds = (data ?? []).map((row) => row.id as string)
      const updatedIdSet = new Set(updatedIds)
      const missingIds = input.transactionIds.filter((id) => !updatedIdSet.has(id))

      // One 'transaction.updated' event per actually-updated row — the
      // exact event type and payload shape useUpdateTransaction.ts emits
      // for a manual category change, so existing subscribers
      // (budgetThresholdSubscriber.ts) behave identically to N individual
      // edits, with no subscriber-side change needed.
      const occurredAt = new Date().toISOString()
      for (const transactionId of updatedIds) {
        emit({
          type: 'transaction.updated',
          householdId: input.householdId,
          actorId: user?.id ?? null,
          occurredAt,
          payload: { transactionId, changedFields: ['categoryId'] },
        })
      }

      return { updatedIds, missingIds }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
      for (const transactionId of result.updatedIds) {
        void queryClient.invalidateQueries({ queryKey: transactionQueryKey(transactionId) })
      }
    },
  })
}
