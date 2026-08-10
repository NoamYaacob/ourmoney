import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { AccountType } from '@/types/app'
import { accountsQueryKey } from './useAccounts'

interface UpdateAccountInput {
  id: string
  name?: string
  type?: AccountType
  color?: string | null
  icon?: string | null
  includeInTotal?: boolean
}

export function useUpdateAccount(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name, type, color, icon, includeInTotal }: UpdateAccountInput) => {
      const { error } = await supabase
        .from('accounts')
        .update({
          ...(name !== undefined && { name }),
          ...(type !== undefined && { type }),
          ...(color !== undefined && { color }),
          ...(icon !== undefined && { icon }),
          ...(includeInTotal !== undefined && { include_in_total: includeInTotal }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey(householdId) })
    },
  })
}
