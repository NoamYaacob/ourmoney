import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { AccountType } from '@/types/app'
import { accountsQueryKey } from './useAccounts'

interface CreateAccountInput {
  householdId: string
  name: string
  type: AccountType
  ownerId?: string | null
  color?: string | null
  icon?: string | null
}

export function useCreateAccount(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateAccountInput) => {
      const { error } = await supabase.from('accounts').insert({
        household_id: input.householdId,
        name: input.name,
        type: input.type,
        owner_id: input.ownerId ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey(householdId) })
    },
  })
}
