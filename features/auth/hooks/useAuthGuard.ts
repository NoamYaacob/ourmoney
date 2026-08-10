// Thin expo-router-wired composition around the pure computeAuthRedirect
// state machine (see features/auth/lib/authRedirect.ts for why the decision
// logic itself lives there instead of here). Mounted once, from
// app/_layout.tsx's AuthGate.

import { useEffect } from 'react'
import { useRouter, useSegments } from 'expo-router'
import { useAuth } from './useAuth'
import { useHasHousehold } from './useHasHousehold'
import { usePendingInvitationToken } from '@/features/household/hooks/usePendingInvitationToken'
import { computeAuthRedirect, type RouteGroup } from '../lib/authRedirect'

export function useAuthGuard() {
  const { session, isLoading: isSessionLoading } = useAuth()
  const userId = session?.user.id
  const { hasHousehold, isLoading: isHouseholdLoading } = useHasHousehold(userId)
  const { token: pendingInvitationToken, isLoading: isPendingTokenLoading } =
    usePendingInvitationToken(!!session)
  const segments = useSegments()
  const router = useRouter()

  // Household/pending-token loading only gate readiness when a session
  // actually exists — both queries stay disabled (isPending: true,
  // permanently) for a signed-out user, which must never be read as "still
  // loading."
  const isLoading =
    isSessionLoading || (!!session && (isHouseholdLoading || isPendingTokenLoading))
  const group = (segments[0] ?? null) as RouteGroup

  useEffect(() => {
    const target = computeAuthRedirect({
      isLoading,
      hasSession: !!session,
      hasHousehold,
      pendingInvitationToken: session ? pendingInvitationToken : null,
      group,
    })
    if (target) router.replace(target)
  }, [isLoading, session, hasHousehold, pendingInvitationToken, group, router])

  return { isLoading }
}
