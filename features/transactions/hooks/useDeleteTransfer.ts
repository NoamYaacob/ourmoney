// Thin wrapper over the delete_transfer() RPC (migration 008, ADR-035) —
// admin-only (matches useDeleteTransaction.ts's admin-gated hard delete of
// an ordinary transaction). A single DELETE FROM transfers server-side
// removes both linked transaction legs atomically via ON DELETE CASCADE —
// there is no separate "delete each leg" step here or anywhere else.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useAuth } from '@/features/auth/hooks/useAuth'

interface DeleteTransferResult {
  ok: boolean
  error?: string
}

export function useDeleteTransfer(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (transferId: string): Promise<void> => {
      const { data, error } = await supabase.rpc('delete_transfer', { p_transfer_id: transferId })
      if (error) throw error

      const result = data as unknown as DeleteTransferResult
      if (!result.ok) throw new Error(result.error ?? 'unknown_error')

      emit({
        type: 'transfer.deleted',
        householdId: householdId as string,
        actorId: user?.id ?? null,
        occurredAt: new Date().toISOString(),
        payload: { transferId },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
