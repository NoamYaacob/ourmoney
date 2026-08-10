// Thin expo-router-wired composition around the pure computeAuthRedirect
// state machine (see features/auth/lib/authRedirect.ts for why the decision
// logic itself lives there instead of here). Mounted once, from
// app/_layout.tsx's AuthGate.

import { useEffect } from 'react'
import { useRouter, useSegments } from 'expo-router'
import { useAuth } from './useAuth'
import { useHasHousehold } from './useHasHousehold'
import { computeAuthRedirect, type RouteGroup } from '../lib/authRedirect'

export function useAuthGuard() {
  const { session, isLoading: isSessionLoading } = useAuth()
  const userId = session?.user.id
  const { hasHousehold, isLoading: isHouseholdLoading } = useHasHousehold(userId)
  const segments = useSegments()
  const router = useRouter()

  // Household loading only gates readiness when a session actually exists —
  // useHasHousehold's query stays disabled (isPending: true, permanently)
  // for a signed-out user, which must never be read as "still loading."
  const isLoading = isSessionLoading || (!!session && isHouseholdLoading)
  const group = (segments[0] ?? null) as RouteGroup

  useEffect(() => {
    const target = computeAuthRedirect({
      isLoading,
      hasSession: !!session,
      hasHousehold,
      group,
    })
    if (target) router.replace(target)
  }, [isLoading, session, hasHousehold, group, router])

  return { isLoading }
}
