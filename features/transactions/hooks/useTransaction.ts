import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Transaction } from '@/types/app'

export function transactionQueryKey(transactionId: string | undefined) {
  return ['transactions', 'detail', transactionId] as const
}

export function useTransaction(transactionId: string | undefined) {
  const query = useQuery({
    queryKey: transactionQueryKey(transactionId),
    queryFn: async (): Promise<Transaction | null> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', transactionId as string)
        .maybeSingle()
      if (error) throw error
      return data as Transaction | null
    },
    enabled: !!transactionId,
  })

  return {
    transaction: query.data ?? null,
    isLoading: !!transactionId && query.isPending,
    error: query.error,
  }
}
