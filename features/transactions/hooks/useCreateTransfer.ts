// Thin wrapper over the create_transfer() RPC (migration 008, ADR-035). The
// RPC does all three writes (the transfers row + both linked transaction
// legs) atomically server-side — this hook never touches the transactions
// table directly, unlike useCreateTransaction.ts, since a transfer's
// atomicity guarantee only holds if the client never assembles it from
// separate statements.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'

export interface CreateTransferInput {
  householdId: string
  fromAccountId: string
  toAccountId: string
  amountAgorot: number
  txnDate: string
  description: string
}

interface CreateTransferResult {
  ok: boolean
  error?: string
  transfer_id?: string
}

export function useCreateTransfer(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreateTransferInput): Promise<string> => {
      const { data, error } = await supabase.rpc('create_transfer', {
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount_agorot: input.amountAgorot,
        p_txn_date: input.txnDate,
        p_description: input.description,
      })
      if (error) throw error

      const result = data as unknown as CreateTransferResult
      if (!result.ok || !result.transfer_id) throw new Error(result.error ?? 'unknown_error')

      emit({
        type: 'transfer.created',
        householdId: input.householdId,
        actorId: user?.id ?? null,
        occurredAt: new Date().toISOString(),
        payload: {
          transferId: result.transfer_id,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          amountAgorot: input.amountAgorot,
          txnDate: input.txnDate,
        },
      })

      return result.transfer_id
    },
    onSuccess: () => {
      // Same 2-element prefix as useCreateTransaction.ts, same reason —
      // matches every query keyed under ['transactions', householdId, ...],
      // including useUncategorizedTransactions.ts's 3-element key.
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
