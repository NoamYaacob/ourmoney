// Supabase session as TanStack Query server state (see ARCHITECTURE.md's
// Realtime Strategy section — this applies the same "push updates into the
// query cache" pattern to another push-driven Supabase subscription).
// staleTime: Infinity means the query never refetches on its own; the
// onAuthStateChange subscription is the only thing that ever updates it,
// via queryClient.setQueryData, exactly like a postgres_changes handler
// calling invalidateQueries — except here the payload IS the new state, so
// setQueryData is used directly instead of a refetch.

import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
// TEMPORARY — spinner-flash-on-tab-focus investigation. See
// lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
import { diagLog } from '@/lib/debug/spinnerDiagnostics'

const SESSION_QUERY_KEY = ['auth', 'session'] as const

export function useAuth() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession()
      return data.session
    },
    staleTime: Infinity,
  })

  // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts.
  useEffect(() => {
    diagLog('useAuth query', {
      status: query.status,
      fetchStatus: query.fetchStatus,
      hasSession: query.data !== undefined && query.data !== null,
    })
  }, [query.status, query.fetchStatus, query.data])

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts.
      diagLog('onAuthStateChange', { event: _event, hasSession: session !== null })
      queryClient.setQueryData<Session | null>(SESSION_QUERY_KEY, session)
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const session = query.data ?? null

  return {
    session,
    user: session?.user ?? null,
    isLoading: query.isPending,
  }
}
