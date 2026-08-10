// Hard delete — admin-only via accounts_delete's RLS policy. Blocked by a
// FK violation (23503) if any transaction still references this account;
// see lib/mapAccountError.ts for the friendly message.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { accountsQueryKey } from './useAccounts'

export function useDeleteAccount(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase.from('accounts').delete().eq('id', accountId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey(householdId) })
    },
  })
}
