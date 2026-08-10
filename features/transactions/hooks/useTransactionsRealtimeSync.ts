// Single subscription owner (ARCHITECTURE.md's Realtime Strategy section) —
// mounted exactly once, in app/(app)/_layout.tsx, never inside
// useTransactions.ts itself. If a per-screen hook opened its own channel,
// two concurrently-mounted screens (e.g. Dashboard + the Transactions tab,
// which the tab navigator keeps both mounted) would open two sockets.
//
// Invalidate, never merge the realtime payload into the cache. This single
// design choice closes echo events (your own mutation's own notification
// just triggers a redundant-but-harmless refetch), ordering (an event
// arriving before or after your own mutation's onSuccess both just mark the
// query stale — whichever settles last triggers the actually-fresh refetch),
// and duplicate events (invalidate is idempotent) all at once, by
// construction — see the M6 plan §7.
//
// Invalidates both ['transactions', householdId] and
// ['budgets', 'progress', householdId] on every change, since a transaction
// change also changes spent/remaining figures. Subscribes to event: '*'
// (insert/update/delete), not just insert.
//
// Effect re-subscribes on householdId change (covers account switch) and
// tears down the channel on unmount or household loss — gated on
// `!!householdId`, so subscribing outside an authenticated household is
// structurally impossible.

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

export function useTransactionsRealtimeSync(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!householdId) return

    const channel = supabase
      .channel(`transactions:household:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `household_id=eq.${householdId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
          void queryClient.invalidateQueries({ queryKey: ['budgets', 'progress', householdId] })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [householdId, queryClient])
}
