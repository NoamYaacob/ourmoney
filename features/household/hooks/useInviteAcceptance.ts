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
// Deferred vs. direct (post-hardening, see docs/DECISIONS.md's Milestone 4
// hardening note): once authenticated, this hook reads the SAME persisted
// pending-token query the auth guard used to decide the redirect. A route
// token that matches the persisted one means THIS acceptance is the
// deferred continuation of an invite tapped before the current session
// existed — the whole point of the hardening is that authentication alone
// must never be read as consent to join, so acceptance waits for an
// explicit confirm() call instead of firing automatically. A route token
// that does NOT match (including no persisted token at all) means the link
// was opened while already signed in — there was never a cross-session gap
// for consent to be ambiguous about, so that case keeps the original
// immediate-accept behavior.
//
// confirm() / cancel() are the only two ways a deferred acceptance
// proceeds. confirm() calls the exact same accept path as the direct-open
// case. cancel() clears the pending token (SecureStore + query cache)
// WITHOUT ever calling accept_invitation, then navigates to '/' — the
// guard, already mounted at the layout level, re-evaluates on the next
// render with a null pending token and routes to wherever real household
// state says the user belongs (never back to this invite).
//
// startedRef prevents the accept mutation from firing more than once per
// mount (both the direct-open effect and a user's confirm() tap funnel
// through the same runAccept). redirectStartedRef is the equivalent guard
// for the unauthenticated store-and-redirect path, kept separate so the two
// flows' re-entrancy guards can't interfere with each other now that they
// live in different effects.
//
// cancel() MUST set startedRef synchronously, before ever touching the
// token (adversarial review finding — confirmed exploitable, not
// theoretical). clearPendingInvitationToken's setQueryData call is
// observed by this same hook's own usePendingInvitationToken subscription,
// which flips isDeferred from true to false on the very next render — and
// the shared accept-effect below cannot otherwise tell "never deferred"
// apart from "just explicitly declined." Without the guard set first, that
// re-render fires runAccept() and silently accepts the very invitation the
// user just tapped Cancel on, deterministically (not a rare timing race).

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAcceptInvitation } from './useAcceptInvitation'
import { usePendingInvitationToken } from './usePendingInvitationToken'
import {
  clearPendingInvitationToken,
  pendingInvitationTokenQueryKey,
  storePendingInvitationToken,
} from '../lib/pendingInvitationToken'
import { mapAcceptInvitationError } from '../lib/mapHouseholdError'

export type InviteAcceptanceStatus = 'checking' | 'redirecting' | 'confirming' | 'accepting' | 'error'

export function useInviteAcceptance(token: string | undefined) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session, isLoading: isAuthLoading } = useAuth()
  const { token: pendingToken, isLoading: isPendingTokenLoading } = usePendingInvitationToken(!!session)
  const acceptInvitation = useAcceptInvitation()
  const [errorMessageKey, setErrorMessageKey] = useState<string | null>(null)
  const [hasStartedAccept, setHasStartedAccept] = useState(false)
  const [hasCancelled, setHasCancelled] = useState(false)
  const startedRef = useRef(false)
  const redirectStartedRef = useRef(false)

  // Only a persisted token that matches THIS route's token proves the
  // deferred, pre-session origin — an unrelated leftover token would be a
  // different bug (already guarded against by the guard's own precedence),
  // not grounds for treating this particular acceptance as pre-consented.
  const isDeferred = !isPendingTokenLoading && !!pendingToken && pendingToken === token

  const runAccept = useCallback(() => {
    if (!token || startedRef.current) return
    startedRef.current = true
    setHasStartedAccept(true)
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
  }, [token, acceptInvitation, router, queryClient])

  const cancel = useCallback(() => {
    if (startedRef.current) return
    // Set BEFORE clearing the token — see the header comment above for why
    // ordering here is load-bearing, not stylistic.
    startedRef.current = true
    setHasCancelled(true)
    void clearPendingInvitationToken(queryClient).then(() => {
      router.replace('/')
    })
  }, [queryClient, router])

  useEffect(() => {
    if (isAuthLoading || !token || session || redirectStartedRef.current) return

    redirectStartedRef.current = true
    void storePendingInvitationToken(token).then(() => {
      queryClient.setQueryData(pendingInvitationTokenQueryKey, token)
      router.replace('/sign-in')
    })
  }, [isAuthLoading, token, session, queryClient, router])

  useEffect(() => {
    if (isAuthLoading || !token || !session) return
    if (isPendingTokenLoading) return // don't know yet whether this is deferred
    if (isDeferred) return // wait for explicit confirm()

    runAccept()
  }, [isAuthLoading, token, session, isPendingTokenLoading, isDeferred, runAccept])

  const status: InviteAcceptanceStatus = (() => {
    if (isAuthLoading || !token) return 'checking'
    if (!session) return 'redirecting'
    if (isPendingTokenLoading) return 'checking'
    if (errorMessageKey) return 'error'
    // Checked before isDeferred: once cancelled, the token clears and
    // isDeferred flips to false on its own — without this branch first,
    // status would misreport 'accepting' for the single frame before
    // cancel()'s navigation away actually lands.
    if (hasCancelled) return 'checking'
    if (isDeferred && !hasStartedAccept) return 'confirming'
    return 'accepting'
  })()

  return { status, errorMessageKey, confirm: runAccept, cancel }
}
