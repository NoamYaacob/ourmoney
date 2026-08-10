// Hard delete — admin-only via transactions_delete's RLS policy. Most
// deletions in the UI should prefer useExcludeTransaction (soft exclusion);
// this exists for the admin "actually remove it" path.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function useDeleteTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', transactionId)
      if (error) throw error
    },
    onSuccess: () => {
      // 2-element prefix — see useCreateTransaction.ts's comment for why.
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
