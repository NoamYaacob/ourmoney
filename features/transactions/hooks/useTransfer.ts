// Fetches a single transfer's shared metadata (migration 008, ADR-035) —
// used by the transfer detail/edit screen. The two linked transaction legs
// are never fetched separately here: from/to account, amount, date, and
// description all live on this one row, which is exactly what the detail
// screen needs to render and prefill an edit form.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import type { Transfer } from '@/types/app'

export function transferQueryKey(transferId: string | undefined) {
  return ['transfers', 'detail', transferId] as const
}

export function useTransfer(transferId: string | undefined) {
  const query = useQuery({
    queryKey: transferQueryKey(transferId),
    queryFn: async (): Promise<Transfer | null> => {
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .eq('id', transferId as string)
        .maybeSingle()
      if (error) throw error
      return data as Transfer | null
    },
    enabled: !!transferId,
  })

  return {
    transfer: query.data ?? null,
    isLoading: !!transferId && query.isPending,
    error: query.error,
  }
}
