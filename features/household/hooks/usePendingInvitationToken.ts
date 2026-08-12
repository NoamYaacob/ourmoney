// Reads the SecureStore-persisted pending invitation token (see
// ../lib/pendingInvitationToken.ts). SecureStore is the source of truth —
// the queryFn always reads it, not just the in-memory cache — so a fresh
// QueryClient after an app kill still resolves whatever was persisted.
// readPendingInvitationToken() also enforces the token's bounded lifetime
// (PENDING_INVITATION_TTL_MS), self-clearing an expired entry.
// staleTime: Infinity because it only ever changes via the explicit
// store/clear calls, same posture as features/auth/hooks/useAuth.ts's
// session query.
//
// enabled only when a session exists: like useHasHousehold's disabled-query
// trap, this query's isPending stays true forever while signed out, and
// must never be read as "still loading" in that state — callers pass
// `enabled` explicitly rather than this hook guessing session state itself.

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pendingInvitationTokenQueryKey, readPendingInvitationToken } from '../lib/pendingInvitationToken'
// TEMPORARY — spinner-flash-on-tab-focus investigation. See
// lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
import { diagLog } from '@/lib/debug/spinnerDiagnostics'

export function usePendingInvitationToken(enabled: boolean) {
  const query = useQuery({
    queryKey: pendingInvitationTokenQueryKey,
    queryFn: readPendingInvitationToken,
    enabled,
    staleTime: Infinity,
  })

  // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts.
  useEffect(() => {
    diagLog('usePendingInvitationToken query', {
      status: query.status,
      fetchStatus: query.fetchStatus,
      hasToken: query.data !== undefined && query.data !== null,
    })
  }, [query.status, query.fetchStatus, query.data])

  return {
    token: enabled ? (query.data ?? null) : null,
    isLoading: enabled && query.isPending,
  }
}
