// is_excluded is user-driven exclusion only — never overloaded to mean
// visibility or anything else (CLAUDE.md § Transaction Identity).

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function useExcludeTransaction(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, isExcluded }: { id: string; isExcluded: boolean }) => {
      const { error } = await supabase.from('transactions').update({ is_excluded: isExcluded }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      // 2-element prefix — see useCreateTransaction.ts's comment for why.
      void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
      void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
    },
  })
}
