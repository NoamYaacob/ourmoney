import { describe, expect, it } from '@jest/globals'
import { computeAuthRedirect, type AuthRedirectTarget, type RouteGroup } from './authRedirect'

// Maps a redirect target back to the route group a real navigation to it
// would land in — used to prove the state machine settles rather than
// oscillates once expo-router actually performs the navigation.
function groupAfter(target: AuthRedirectTarget): RouteGroup {
  if (target?.startsWith('/invite/')) return 'invite'
  switch (target) {
    case '/sign-in':
      return '(auth)'
    case '/dashboard':
      return '(app)'
    case '/onboarding/create-household':
      return 'onboarding'
    case null:
      throw new Error('groupAfter called with a non-redirect target')
    default:
      throw new Error(`groupAfter: unhandled target ${target}`)
  }
}

describe('computeAuthRedirect', () => {
  it('never redirects while loading, regardless of other state', () => {
    expect(
      computeAuthRedirect({
        isLoading: true,
        hasSession: false,
        hasHousehold: undefined,
        pendingInvitationToken: undefined,
        group: null,
      })
    ).toBeNull()
    expect(
      computeAuthRedirect({
        isLoading: true,
        hasSession: true,
        hasHousehold: true,
        pendingInvitationToken: null,
        group: '(auth)',
      })
    ).toBeNull()
  })

  it('passes through invite and reset-password regardless of state', () => {
    for (const group of ['invite', 'reset-password'] as const) {
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: false,
          hasHousehold: undefined,
          pendingInvitationToken: undefined,
          group,
        })
      ).toBeNull()
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: true,
          hasHousehold: true,
          pendingInvitationToken: 'tok',
          group,
        })
      ).toBeNull()
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: true,
          hasHousehold: false,
          pendingInvitationToken: null,
          group,
        })
      ).toBeNull()
    }
  })

  it('sends an unauthenticated user to sign-in from anywhere except (auth), regardless of a pending token', () => {
    for (const group of ['(app)', 'onboarding', null] as const) {
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: false,
          hasHousehold: undefined,
          pendingInvitationToken: 'tok',
          group,
        })
      ).toBe('/sign-in')
    }
    expect(
      computeAuthRedirect({
        isLoading: false,
        hasSession: false,
        hasHousehold: undefined,
        pendingInvitationToken: undefined,
        group: '(auth)',
      })
    ).toBeNull()
  })

  it('does not redirect an authenticated user still inside (auth) before household state resolves', () => {
    // A user who just signed in is briefly still on an (auth) screen; the
    // guard must wait for hasHousehold before deciding where they belong.
    expect(
      computeAuthRedirect({
        isLoading: false,
        hasSession: true,
        hasHousehold: undefined,
        pendingInvitationToken: null,
        group: '(auth)',
      })
    ).toBeNull()
  })

  it('sends a household-less authenticated user to onboarding from anywhere except onboarding', () => {
    for (const group of ['(auth)', '(app)', null] as const) {
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: true,
          hasHousehold: false,
          pendingInvitationToken: null,
          group,
        })
      ).toBe('/onboarding/create-household')
    }
    expect(
      computeAuthRedirect({
        isLoading: false,
        hasSession: true,
        hasHousehold: false,
        pendingInvitationToken: null,
        group: 'onboarding',
      })
    ).toBeNull()
  })

  it('sends an authenticated user with a household to the dashboard from anywhere except (app)', () => {
    for (const group of ['(auth)', 'onboarding', null] as const) {
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: true,
          hasHousehold: true,
          pendingInvitationToken: null,
          group,
        })
      ).toBe('/dashboard')
    }
    expect(
      computeAuthRedirect({
        isLoading: false,
        hasSession: true,
        hasHousehold: true,
        pendingInvitationToken: null,
        group: '(app)',
      })
    ).toBeNull()
  })

  describe('pending invitation token precedence (Milestone 4)', () => {
    it('does not decide while the pending-token check is still in flight', () => {
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: true,
          hasHousehold: false,
          pendingInvitationToken: undefined,
          group: '(auth)',
        })
      ).toBeNull()
      expect(
        computeAuthRedirect({
          isLoading: false,
          hasSession: true,
          hasHousehold: true,
          pendingInvitationToken: undefined,
          group: '(auth)',
        })
      ).toBeNull()
    })

    it('outranks routing to onboarding for a household-less authenticated user', () => {
      for (const group of ['(auth)', '(app)', 'onboarding', null] as const) {
        expect(
          computeAuthRedirect({
            isLoading: false,
            hasSession: true,
            hasHousehold: false,
            pendingInvitationToken: 'tok-abc',
            group,
          })
        ).toBe('/invite/tok-abc')
      }
    })

    it('outranks routing to the dashboard for a household member', () => {
      for (const group of ['(auth)', 'onboarding', '(app)', null] as const) {
        expect(
          computeAuthRedirect({
            isLoading: false,
            hasSession: true,
            hasHousehold: true,
            pendingInvitationToken: 'tok-abc',
            group,
          })
        ).toBe('/invite/tok-abc')
      }
    })

    // The concrete proof behind the required regression test: once a token
    // is cleared (e.g. useInviteAcceptance's onSettled ran after
    // accept_invitation returned invalid_invitation for a
    // dead/expired/revoked/reused invitation), no state combination can
    // ever route back to /invite/* on it — the branch requires a truthy
    // token, full stop.
    it('never redirects to /invite/* once the pending token is cleared (null)', () => {
      const hasHouseholdValues = [undefined, false, true] as const
      const groups: RouteGroup[] = ['(auth)', '(app)', 'onboarding', 'invite', 'reset-password', null]

      for (const hasHousehold of hasHouseholdValues) {
        for (const group of groups) {
          const target = computeAuthRedirect({
            isLoading: false,
            hasSession: true,
            hasHousehold,
            pendingInvitationToken: null,
            group,
          })
          expect(target?.startsWith('/invite/')).not.toBe(true)
        }
      }
    })
  })

  it('never enters a redirect loop: feeding each redirect back in always settles to null', () => {
    const scenarios: Omit<Parameters<typeof computeAuthRedirect>[0], 'group'>[] = [
      { isLoading: false, hasSession: false, hasHousehold: undefined, pendingInvitationToken: undefined },
      { isLoading: false, hasSession: true, hasHousehold: false, pendingInvitationToken: null },
      { isLoading: false, hasSession: true, hasHousehold: true, pendingInvitationToken: null },
      { isLoading: false, hasSession: true, hasHousehold: false, pendingInvitationToken: 'tok' },
      { isLoading: false, hasSession: true, hasHousehold: true, pendingInvitationToken: 'tok' },
    ]
    const startingGroups: RouteGroup[] = ['(auth)', '(app)', 'onboarding', 'invite', null]

    for (const scenario of scenarios) {
      for (const startGroup of startingGroups) {
        let group = startGroup
        let redirectCount = 0

        // A correct guard converges in at most one hop; allow a generous
        // budget and assert it actually stabilizes well before exhausting it.
        for (let i = 0; i < 5; i++) {
          const target = computeAuthRedirect({ ...scenario, group })
          if (target === null) break
          redirectCount++
          group = groupAfter(target)
        }

        expect(redirectCount).toBeLessThanOrEqual(1)
        expect(computeAuthRedirect({ ...scenario, group })).toBeNull()
      }
    }
  })
})
