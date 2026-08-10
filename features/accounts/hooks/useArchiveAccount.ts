// Soft "delete" for regular (non-admin) members: is_active = FALSE hides
// the account from active pickers without requiring the admin-only DELETE
// policy, and without hitting accounts' default ON DELETE RESTRICT from any
// existing transactions.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { accountsQueryKey } from './useAccounts'

export function useArchiveAccount(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.from('accounts').update({ is_active: false }).eq('id', accountId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey(householdId) })
    },
  })
}
