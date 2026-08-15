import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { transactionQueryKey } from './useTransaction'

export interface UpdateTransactionInput {
  id: string
  householdId: string
  accountId?: string
  categoryId?: string | null
  amountAgorot?: number
  description?: string
  merchantName?: string | null
  txnDate?: string
  isShared?: boolean
  payerId?: string | null
  note?: string | null
}

export function useUpdateTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: UpdateTransactionInput) => {
      const { id, householdId: inputHouseholdId, ...fields } = input
      const changedFields = Object.keys(fields).filter((key) => fields[key as keyof typeof fields] !== undefined)

      const { error } = await supabase
        .from('transactions')
        .update({
          ...(fields.accountId !== undefined && { account_id: fields.accountId }),
          // A caller only includes categoryId when the user genuinely
          // changed it (see transactions/[id].tsx's handleSave) — so this is
          // exactly "the user manually overrode the category," which must
          // clear any recorded rule provenance (ADR-027): a category no rule
          // set must never still claim a rule set it.
          ...(fields.categoryId !== undefined && { category_id: fields.categoryId, matched_rule_id: null }),
          ...(fields.amountAgorot !== undefined && { amount_agorot: fields.amountAgorot }),
          ...(fields.description !== undefined && { description: fields.description }),
          ...(fields.merchantName !== undefined && { merchant_name: fields.merchantName }),
          ...(fields.txnDate !== undefined && { txn_date: fields.txnDate }),
          ...(fields.isShared !== undefined && { is_shared: fields.isShared }),
          ...(fields.payerId !== undefined && { payer_id: fields.payerId }),
          ...(fields.note !== undefined && { note: fields.note }),
        })
        .eq('id', id)
      if (error) throw error

      emit({
        type: 'transaction.updated',
        householdId: inputHouseholdId,
        actorId: user?.id ?? null,
        occurredAt: new Date().toISOString(),
        payload: { transactionId: id, changedFields },
      })
    },
    onSuccess: (_data, variables) => {
      // 2-element prefix — see useCreateTransaction.ts's identical comment
      // for why (mobile-expo-reviewer finding: the 3-element
      // transactionsQueryKey() form never matched
      // useUncategorizedTransactions.ts's key, so assigning a category from
      // the Budgets uncategorized queue left the row listed there stale).
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: transactionQueryKey(variables.id) })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
