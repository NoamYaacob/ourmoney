// Thin wrapper over the update_transfer() RPC (migration 008, ADR-035) —
// atomically rewrites the transfers row and both linked transaction legs
// together server-side. Unlike useUpdateTransaction.ts, every field is
// required on every call (the RPC has no partial-update form) since a
// transfer's from/to/amount/date/description are one coherent unit, not
// independently patchable fields.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { transferQueryKey } from './useTransfer'

export interface UpdateTransferInput {
  transferId: string
  householdId: string
  fromAccountId: string
  toAccountId: string
  amountAgorot: number
  txnDate: string
  description: string
}

interface UpdateTransferResult {
  ok: boolean
  error?: string
}

export function useUpdateTransfer(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: UpdateTransferInput): Promise<void> => {
      const { data, error } = await supabase.rpc('update_transfer', {
        p_transfer_id: input.transferId,
        p_from_account_id: input.fromAccountId,
        p_to_account_id: input.toAccountId,
        p_amount_agorot: input.amountAgorot,
        p_txn_date: input.txnDate,
        p_description: input.description,
      })
      if (error) throw error

      const result = data as unknown as UpdateTransferResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')

      emit({
        type: 'transfer.updated',
        householdId: input.householdId,
        actorId: user?.id ?? null,
        occurredAt: new Date().toISOString(),
        payload: {
          transferId: input.transferId,
          fromAccountId: input.fromAccountId,
          toAccountId: input.toAccountId,
          amountAgorot: input.amountAgorot,
          txnDate: input.txnDate,
        },
      })
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: transferQueryKey(variables.transferId) })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
