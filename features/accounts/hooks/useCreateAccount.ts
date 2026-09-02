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
  // Only meaningful for type 'credit_card' — the day-of-month a statement
  // cycle closes on, migration 016 (ADR-037). A card's current-cycle spend
  // is always derived live from this value, never stored.
  billingCycleDay?: number | null
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
        billing_cycle_day: input.billingCycleDay ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountsQueryKey(householdId) })
    },
  })
}
