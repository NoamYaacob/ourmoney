// Backs app/invite/[token].tsx — every branch of docs/PHASE_1_PLAN.md §4.3's
// "if not signed in when the link opens" flow lives here, not in the
// screen, so the screen stays thin (no Supabase call, no branching logic in
// its body).
//
// Unauthenticated: store the token in SecureStore and redirect to sign-in,
// then STOP — the token is deliberately left in place, not cleared, or the
// whole deferred-acceptance mechanism breaks before the user even reaches
// sign-in. features/auth/lib/authRedirect.ts's pendingInvitationToken
// precedence is what routes the user back to /invite/<token> once they
// authenticate.
//
// Authenticated (whether already signed in when the link opened, or having
// just completed the sign-in detour above): call accept_invitation
// directly with the route-param token. Its mutation's own onSettled
// (success OR error) is the ONLY thing that clears the pending token —
// this is what stops a stale leftover token from re-triggering the guard's
// redirect branch later, without ever erasing it prematurely on the
// store-and-redirect path above.
//
// startedRef prevents this effect from re-storing/re-mutating on every
// re-render (e.g. when the mutation's own pending state changes and
// re-triggers a render) — the flow starts exactly once per mount.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAcceptInvitation } from './useAcceptInvitation'
import {
  clearPendingInvitationToken,
  pendingInvitationTokenQueryKey,
  storePendingInvitationToken,
} from '../lib/pendingInvitationToken'
import { mapAcceptInvitationError } from '../lib/mapHouseholdError'

export type InviteAcceptanceStatus = 'checking' | 'redirecting' | 'accepting' | 'error'

export function useInviteAcceptance(token: string | undefined) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, isLoading: isAuthLoading } = useAuth()
  const acceptInvitation = useAcceptInvitation()
  const [errorMessageKey, setErrorMessageKey] = useState<string | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (isAuthLoading || !token || startedRef.current) return

    if (!session) {
      startedRef.current = true
      void storePendingInvitationToken(token).then(() => {
        queryClient.setQueryData(pendingInvitationTokenQueryKey, token)
        router.replace('/sign-in')
      })
      return
    }

    startedRef.current = true
    acceptInvitation.mutate(token, {
      onSettled: () => void clearPendingInvitationToken(queryClient),
      onSuccess: (result) => {
        if (result.ok) {
          router.replace('/dashboard')
          return
        }
        if (result.error === 'unauthenticated') {
          // Should not occur behind the auth guard — session is truthy here.
          console.error('[invite] accept_invitation returned unauthenticated behind the auth guard')
        }
        setErrorMessageKey(mapAcceptInvitationError(result.error))
      },
      onError: () => setErrorMessageKey('invite.errors.generic'),
    })
  }, [isAuthLoading, token, session, acceptInvitation, router, queryClient])

  const status: InviteAcceptanceStatus =
    isAuthLoading || !token
      ? 'checking'
      : !session
        ? 'redirecting'
        : errorMessageKey
          ? 'error'
          : 'accepting'

  return { status, errorMessageKey }
}
