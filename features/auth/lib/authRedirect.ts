// Pure redirect-decision function for the root auth guard (see
// features/auth/hooks/useAuthGuard.ts). Kept side-effect-free and independent
// of expo-router so the no-infinite-redirect-loop property is a plain,
// deterministic assertion: feeding this function's own output back in as the
// next `group` must always resolve to `null` (see authRedirect.test.ts).
//
// `group` is expo-router's useSegments()[0] — the first path segment,
// including group-folder names in parentheses. 'invite' and 'reset-password'
// are real (non-grouped) entry points reached via deep link; the guard must
// not fight either of them mid-flow (e.g. redirecting a user away from
// reset-password before they finish setting a new password), so both are
// treated as pass-through regardless of session/household state.

export type RouteGroup = '(auth)' | '(app)' | 'onboarding' | 'invite' | 'reset-password' | null

export interface AuthRedirectInput {
  isLoading: boolean
  hasSession: boolean
  hasHousehold: boolean | undefined
  group: RouteGroup
}

export type AuthRedirectTarget = '/sign-in' | '/dashboard' | '/onboarding/create-household' | null

export function computeAuthRedirect(input: AuthRedirectInput): AuthRedirectTarget {
  const { isLoading, hasSession, hasHousehold, group } = input

  if (isLoading) return null
  if (group === 'invite' || group === 'reset-password') return null

  if (!hasSession) {
    return group === '(auth)' ? null : '/sign-in'
  }

  // Defensive: isLoading should already cover "household check still
  // pending," but an undefined result must never be read as "no household."
  if (hasHousehold === undefined) return null

  if (!hasHousehold) {
    return group === 'onboarding' ? null : '/onboarding/create-household'
  }

  return group === '(app)' ? null : '/dashboard'
}
