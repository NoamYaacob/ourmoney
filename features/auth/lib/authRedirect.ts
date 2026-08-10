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
//
// pendingInvitationToken (Milestone 4): a user who tapped an invite link
// while signed out has the token persisted in SecureStore and gets routed
// to sign-in first; once they authenticate, this precedence sends them back
// to /invite/<token> instead of the normal household routing, so the
// invitation actually gets consumed. Evaluated after the no-session branch
// (a signed-out user always goes through sign-in regardless of a pending
// token) and before the household branches (a pending token outranks both
// onboarding and dashboard). This can never reintroduce a loop: `group ===
// 'invite'` is already unconditional pass-through above, so once routed
// there this branch cannot fire against its own output. Accepted, bounded
// trade-off: an already-settled household member with a stale leftover
// token (e.g. the app was killed before the invite screen's mutation
// settled and cleared it) gets redirected away from (app) to the invite
// screen once, before landing back on the dashboard — a one-time
// interruption, not a loop, and not a bug.

export type RouteGroup = '(auth)' | '(app)' | 'onboarding' | 'invite' | 'reset-password' | null

export interface AuthRedirectInput {
  isLoading: boolean
  hasSession: boolean
  hasHousehold: boolean | undefined
  pendingInvitationToken: string | null | undefined
  group: RouteGroup
}

export type AuthRedirectTarget =
  | '/sign-in'
  | '/dashboard'
  | '/onboarding/create-household'
  | `/invite/${string}`
  | null

export function computeAuthRedirect(input: AuthRedirectInput): AuthRedirectTarget {
  const { isLoading, hasSession, hasHousehold, pendingInvitationToken, group } = input

  if (isLoading) return null
  if (group === 'invite' || group === 'reset-password') return null

  if (!hasSession) {
    return group === '(auth)' ? null : '/sign-in'
  }

  // Defensive: isLoading should already cover "pending-token check still in
  // flight," but undefined must never be read as "no pending token."
  if (pendingInvitationToken === undefined) return null
  if (pendingInvitationToken) return `/invite/${pendingInvitationToken}`

  // Defensive: isLoading should already cover "household check still
  // pending," but an undefined result must never be read as "no household."
  if (hasHousehold === undefined) return null

  if (!hasHousehold) {
    return group === 'onboarding' ? null : '/onboarding/create-household'
  }

  return group === '(app)' ? null : '/dashboard'
}
