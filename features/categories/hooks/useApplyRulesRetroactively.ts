// Applies the household's current rules to already-existing uncategorized
// transactions — ADR-027's "retroactive rule application." Reuses
// lib/matchRule.ts's findMatchingRule, the exact same matcher used at
// transaction-creation time (one implementation, two call sites).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { transactionsQueryKey } from '@/features/transactions/hooks/useTransactions'
import { findMatchingRule } from '../lib/matchRule'
import { categoriesQueryKey } from './useCategories'
import type { CategoryRule } from '@/types/app'

export function useApplyRulesRetroactively(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async () => {
      if (!householdId) throw new Error('no household')

      const [{ data: rules, error: rulesError }, { data: uncategorized, error: txnError }] = await Promise.all([
        supabase.from('category_rules').select('*').eq('household_id', householdId).eq('is_active', true),
        supabase
          .from('transactions')
          .select('id, description, merchant_name, category_id')
          .eq('household_id', householdId)
          .is('category_id', null),
      ])
      if (rulesError) throw rulesError
      if (txnError) throw txnError

      let updatedCount = 0
      for (const transaction of uncategorized ?? []) {
        const matched = findMatchingRule(rules as CategoryRule[], transaction)
        if (!matched) continue

        const { error: updateError } = await supabase
          .from('transactions')
          .update({ category_id: matched.category_id })
          .eq('id', transaction.id)
        if (updateError) throw updateError

        emit({
          type: 'transaction.categorized',
          householdId,
          actorId: user?.id ?? null,
          occurredAt: new Date().toISOString(),
          payload: {
            transactionId: transaction.id,
            categoryId: matched.category_id,
            previousCategoryId: null,
          },
        })
        updatedCount += 1
      }

      return updatedCount
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: transactionsQueryKey(householdId) })
      void queryClient.invalidateQueries({ queryKey: categoriesQueryKey(householdId) })
    },
  })
}
