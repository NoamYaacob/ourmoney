// Creation is wired to lib/matchRule.ts (auto-categorize when the caller
// doesn't supply a categoryId) and emits 'transaction.created' only — it
// never imports or calls anything under lib/notifications/. Budget-threshold
// computation lives in features/budgets/lib/budgetThresholdSubscriber.ts,
// which reacts to this same event from the other side of the seam
// (ARCHITECTURE.md: "adding a subscriber must never require touching the
// emitting module").

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { findMatchingRule } from '@/features/categories/lib/matchRule'
import type { CategoryRule } from '@/types/app'

export interface CreateTransactionInput {
  householdId: string
  accountId: string
  categoryId?: string | null
  amountAgorot: number
  description: string
  merchantName?: string | null
  txnDate: string
  isShared: boolean
  payerId?: string | null
  note?: string | null
}

export function useCreateTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      let categoryId = input.categoryId ?? null

      if (!categoryId) {
        const { data: rules, error: rulesError } = await supabase
          .from('category_rules')
          .select('*')
          .eq('household_id', input.householdId)
          .eq('is_active', true)
        if (rulesError) throw rulesError
        const matched = findMatchingRule(rules as CategoryRule[], {
          description: input.description,
          merchant_name: input.merchantName ?? null,
        })
        if (matched) categoryId = matched.category_id
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          household_id: input.householdId,
          account_id: input.accountId,
          category_id: categoryId,
          amount_agorot: input.amountAgorot,
          description: input.description,
          merchant_name: input.merchantName ?? null,
          txn_date: input.txnDate,
          is_shared: input.isShared,
          payer_id: input.payerId ?? null,
          note: input.note ?? null,
          source: 'manual',
          created_by: user?.id as string,
        })
        .select('id')
        .single()
      if (error) throw error

      emit({
        type: 'transaction.created',
        householdId: input.householdId,
        actorId: user?.id ?? null,
        occurredAt: new Date().toISOString(),
        payload: {
          transactionId: data.id,
          accountId: input.accountId,
          categoryId,
          amountAgorot: input.amountAgorot,
          isShared: input.isShared,
          txnDate: input.txnDate,
        },
      })

      return data.id
    },
    onSuccess: () => {
      // 2-element prefix, NOT transactionsQueryKey(householdId) (which
      // resolves to a 3-element key with an always-{} filters object) —
      // TanStack's prefix match requires the shorter key to be an exact
      // leading subsequence, so the 3-element form only ever matched the
      // unfiltered list itself, never
      // features/budgets/hooks/useUncategorizedTransactions.ts's
      // ['transactions', householdId, 'uncategorized'] key (mobile-expo-
      // reviewer finding, confirmed against the installed TanStack Query's
      // own partialMatchKey — a newly-created transaction never appeared in
      // the Uncategorized queue until the 30s staleTime lapsed).
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
