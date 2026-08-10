import { describe, expect, it } from '@jest/globals'
import { computeAuthRedirect, type AuthRedirectTarget, type RouteGroup } from './authRedirect'

// Maps a redirect target back to the route group a real navigation to it
// would land in — used to prove the state machine settles rather than
// oscillates once expo-router actually performs the navigation.
function groupAfter(target: AuthRedirectTarget): RouteGroup {
  switch (target) {
    case '/sign-in':
      return '(auth)'
    case '/dashboard':
      return '(app)'
    case '/onboarding/create-household':
      return 'onboarding'
    case null:
      throw new Error('groupAfter called with a non-redirect target')
  }
}

describe('computeAuthRedirect', () => {
  it('never redirects while loading, regardless of other state', () => {
    expect(
      computeAuthRedirect({ isLoading: true, hasSession: false, hasHousehold: undefined, group: null })
    ).toBeNull()
    expect(
      computeAuthRedirect({ isLoading: true, hasSession: true, hasHousehold: true, group: '(auth)' })
    ).toBeNull()
  })

  it('passes through invite and reset-password regardless of state', () => {
    for (const group of ['invite', 'reset-password'] as const) {
      expect(
        computeAuthRedirect({ isLoading: false, hasSession: false, hasHousehold: undefined, group })
      ).toBeNull()
      expect(
        computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: true, group })
      ).toBeNull()
      expect(
        computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: false, group })
      ).toBeNull()
    }
  })

  it('sends an unauthenticated user to sign-in from anywhere except (auth)', () => {
    for (const group of ['(app)', 'onboarding', null] as const) {
      expect(
        computeAuthRedirect({ isLoading: false, hasSession: false, hasHousehold: undefined, group })
      ).toBe('/sign-in')
    }
    expect(
      computeAuthRedirect({ isLoading: false, hasSession: false, hasHousehold: undefined, group: '(auth)' })
    ).toBeNull()
  })

  it('does not redirect an authenticated user still inside (auth) before household state resolves', () => {
    // A user who just signed in is briefly still on an (auth) screen; the
    // guard must wait for hasHousehold before deciding where they belong.
    expect(
      computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: undefined, group: '(auth)' })
    ).toBeNull()
  })

  it('sends a household-less authenticated user to onboarding from anywhere except onboarding', () => {
    for (const group of ['(auth)', '(app)', null] as const) {
      expect(
        computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: false, group })
      ).toBe('/onboarding/create-household')
    }
    expect(
      computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: false, group: 'onboarding' })
    ).toBeNull()
  })

  it('sends an authenticated user with a household to the dashboard from anywhere except (app)', () => {
    for (const group of ['(auth)', 'onboarding', null] as const) {
      expect(
        computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: true, group })
      ).toBe('/dashboard')
    }
    expect(
      computeAuthRedirect({ isLoading: false, hasSession: true, hasHousehold: true, group: '(app)' })
    ).toBeNull()
  })

  it('never enters a redirect loop: feeding each redirect back in always settles to null', () => {
    const scenarios: Omit<Parameters<typeof computeAuthRedirect>[0], 'group'>[] = [
      { isLoading: false, hasSession: false, hasHousehold: undefined },
      { isLoading: false, hasSession: true, hasHousehold: false },
      { isLoading: false, hasSession: true, hasHousehold: true },
    ]
    const startingGroups: RouteGroup[] = ['(auth)', '(app)', 'onboarding', null]

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
