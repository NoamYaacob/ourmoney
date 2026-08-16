import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import { plannedObligationsQueryKey } from './usePlannedObligations'
import type { PlannedObligationStatus } from '@/types/app'

interface UpdatePlannedObligationInput {
  id: string
  name?: string
  amountAgorot?: number
  dueDate?: string
  categoryId?: string | null
  accountId?: string | null
  isShared?: boolean
  notes?: string | null
  status?: PlannedObligationStatus
}

export function useUpdatePlannedObligation(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name, amountAgorot, dueDate, categoryId, accountId, isShared, notes, status }: UpdatePlannedObligationInput) => {
      const { error } = await supabase
        .from('planned_obligations')
        .update({
          ...(name !== undefined && { name }),
          ...(amountAgorot !== undefined && { amount_agorot: amountAgorot }),
          ...(dueDate !== undefined && { due_date: dueDate }),
          ...(categoryId !== undefined && { category_id: categoryId }),
          ...(accountId !== undefined && { account_id: accountId }),
          ...(isShared !== undefined && { is_shared: isShared }),
          ...(notes !== undefined && { notes }),
          ...(status !== undefined && { status }),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plannedObligationsQueryKey(householdId) })
    },
  })
}
