import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { plannedObligationsQueryKey } from './usePlannedObligations'

interface CreatePlannedObligationInput {
  householdId: string
  name: string
  amountAgorot: number
  dueDate: string
  categoryId?: string | null
  accountId?: string | null
  isShared: boolean
  notes?: string | null
}

export function useCreatePlannedObligation(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (input: CreatePlannedObligationInput) => {
      const { error } = await supabase.from('planned_obligations').insert({
        household_id: input.householdId,
        name: input.name,
        amount_agorot: input.amountAgorot,
        due_date: input.dueDate,
        category_id: input.categoryId ?? null,
        account_id: input.accountId ?? null,
        is_shared: input.isShared,
        notes: input.notes ?? null,
        created_by: user?.id as string,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plannedObligationsQueryKey(householdId) })
    },
  })
}
