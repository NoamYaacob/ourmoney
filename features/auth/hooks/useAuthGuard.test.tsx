// Tests the expo-router wiring layer around computeAuthRedirect (see
// authRedirect.test.ts for the exhaustive state-machine coverage) — this
// file verifies useAuthGuard actually calls router.replace with the right
// target, and just as importantly, does NOT call it when already in the
// correct place (adversarial review flagged this composition layer as
// having zero dedicated coverage beyond the pure function it wraps).

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import type { Session } from '@supabase/supabase-js'
import { useAuthGuard } from './useAuthGuard'
import { useAuth } from './useAuth'
import { useHasHousehold } from './useHasHousehold'
import { usePendingInvitationToken } from '@/features/household/hooks/usePendingInvitationToken'

// useAuth.ts, useHasHousehold.ts, and usePendingInvitationToken.ts are
// automocked (no factory), which still requires evaluating their real
// module bodies to introspect exports — all transitively import
// lib/supabase/client.ts, whose real module creates a Supabase client at
// import time and throws without env vars. Mocking the client itself (the
// existing manual mock) short-circuits that entirely.
jest.mock('@/lib/supabase/client')
jest.mock('./useAuth')
jest.mock('./useHasHousehold')
jest.mock('@/features/household/hooks/usePendingInvitationToken')

const mockReplace = jest.fn()
let mockSegments: string[] = []

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSegments: () => mockSegments,
}))

const fakeSession = { user: { id: 'user-1' } } as Session
const noPendingToken = { token: null, isLoading: false }

describe('useAuthGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSegments = []
    jest.mocked(usePendingInvitationToken).mockReturnValue(noPendingToken)
  })

  it('does not redirect while auth is still loading', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: null, user: null, isLoading: true })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: undefined, isLoading: false })
    mockSegments = ['(app)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects an unauthenticated user from a protected group to sign-in', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: null, user: null, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: undefined, isLoading: false })
    mockSegments = ['(app)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).toHaveBeenCalledWith('/sign-in')
  })

  it('does not redirect an unauthenticated user already on an (auth) screen', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: null, user: null, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: undefined, isLoading: false })
    mockSegments = ['(auth)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('waits for the household check before redirecting a freshly authenticated user', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: undefined, isLoading: true })
    mockSegments = ['(auth)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('redirects an authenticated user with no household to onboarding', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: false, isLoading: false })
    mockSegments = ['(auth)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).toHaveBeenCalledWith('/onboarding/create-household')
  })

  it('redirects an authenticated user with a household to the dashboard', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: true, isLoading: false })
    mockSegments = ['(auth)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).toHaveBeenCalledWith('/dashboard')
  })

  it('does not redirect an authenticated user with a household already in (app)', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: true, isLoading: false })
    mockSegments = ['(app)']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('never redirects a user on the reset-password deep-link screen, regardless of state', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: false, isLoading: false })
    mockSegments = ['reset-password']

    await renderHook(() => useAuthGuard())
    expect(mockReplace).not.toHaveBeenCalled()
  })

  describe('pending invitation token (Milestone 4)', () => {
    it('redirects a signed-in user with a pending invite token to /invite/<token>, outranking onboarding', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: false, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockReturnValue({ token: 'tok-abc', isLoading: false })
      mockSegments = ['(auth)']

      await renderHook(() => useAuthGuard())
      expect(mockReplace).toHaveBeenCalledWith('/invite/tok-abc')
    })

    it('redirects a signed-in household member with a pending invite token to /invite/<token>, outranking the dashboard', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: true, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockReturnValue({ token: 'tok-abc', isLoading: false })
      mockSegments = ['(app)']

      await renderHook(() => useAuthGuard())
      expect(mockReplace).toHaveBeenCalledWith('/invite/tok-abc')
    })

    it('does not redirect while the pending-token check is still loading', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: true, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockReturnValue({ token: null, isLoading: true })
      mockSegments = ['(auth)']

      await renderHook(() => useAuthGuard())
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('never redirects a user already on the invite screen, even with a pending token', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: false, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockReturnValue({ token: 'tok-abc', isLoading: false })
      mockSegments = ['invite']

      await renderHook(() => useAuthGuard())
      expect(mockReplace).not.toHaveBeenCalled()
    })

    // Regression proof for the required scenario: once useInviteAcceptance's
    // onSettled clears a dead token (invalid/expired/revoked/reused
    // invitation), the guard's very next evaluation must route by normal
    // household state, never back to /invite/*.
    it('routes to the dashboard, not back to /invite/*, once a dead pending token has been cleared', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(useHasHousehold).mockReturnValue({ hasHousehold: true, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockReturnValue({ token: null, isLoading: false })
      mockSegments = ['(auth)']

      await renderHook(() => useAuthGuard())
      expect(mockReplace).toHaveBeenCalledWith('/dashboard')
      expect(mockReplace).not.toHaveBeenCalledWith(expect.stringMatching(/^\/invite\//))
    })
  })
})
