import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import * as SecureStore from 'expo-secure-store'
import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { useInviteAcceptance } from './useInviteAcceptance'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAcceptInvitation } from './useAcceptInvitation'
import { usePendingInvitationToken } from './usePendingInvitationToken'
import { pendingInvitationTokenQueryKey } from '../lib/pendingInvitationToken'
import type { AcceptInvitationResult } from './useAcceptInvitation'

// useAuth.ts and useAcceptInvitation.ts are automocked (no factory), which
// still requires evaluating their real module bodies to introspect exports
// — both transitively import lib/supabase/client.ts, whose real module
// creates a Supabase client at import time and throws without env vars.
// Mocking the client itself (the existing manual mock) short-circuits that.
//
// usePendingInvitationToken is also automocked, and controlled explicitly
// per test (rather than left to resolve for real through the mocked
// SecureStore) — that's the ONLY signal useInviteAcceptance has for
// telling a deferred (persisted pre-session) acceptance apart from one
// opened while already authenticated, so tests must set it deliberately
// instead of relying on incidental timing.
jest.mock('@/lib/supabase/client')
jest.mock('expo-secure-store')
jest.mock('@/features/auth/hooks/useAuth')
jest.mock('./useAcceptInvitation')
jest.mock('./usePendingInvitationToken')

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

// The REAL usePendingInvitationToken implementation (not the automock above)
// — used only by the regression test below, which must observe the actual
// query-cache reactivity that the plain mockDeferred()/mockNotDeferred()
// helpers cannot: a static mockReturnValue never changes when
// clearPendingInvitationToken calls queryClient.setQueryData, so it cannot
// reproduce (or catch a regression of) the bug where cancel()'s own token
// clear flips isDeferred to false and re-triggers the shared accept effect.
const { usePendingInvitationToken: realUsePendingInvitationToken } = jest.requireActual<
  typeof import('./usePendingInvitationToken')
>('./usePendingInvitationToken')

const fakeSession = { user: { id: 'user-1' } } as Session
const fakeSessionOtherUser = { user: { id: 'user-2' } } as Session

type MutateOptions = {
  onSettled?: () => void
  onSuccess?: (result: AcceptInvitationResult) => void
  onError?: (error: unknown) => void
}

function mockAcceptInvitation(outcome: { result?: AcceptInvitationResult; error?: unknown }) {
  const mutate = jest.fn((_token: string, options?: MutateOptions) => {
    if (outcome.error !== undefined) {
      options?.onError?.(outcome.error)
    } else if (outcome.result) {
      options?.onSuccess?.(outcome.result)
    }
    options?.onSettled?.()
  })
  jest.mocked(useAcceptInvitation).mockReturnValue({ mutate } as unknown as ReturnType<
    typeof useAcceptInvitation
  >)
  return mutate
}

// No persisted token (or one that doesn't match the route token) — the
// "opened while already authenticated" case, which must keep behaving
// exactly as it did before this hardening.
function mockNotDeferred() {
  jest.mocked(usePendingInvitationToken).mockReturnValue({ token: null, isLoading: false })
}

// A persisted token equal to the route token — the "resumed after a
// sign-in/sign-up detour" case, which must now wait for explicit
// confirmation instead of auto-accepting.
function mockDeferred(token: string) {
  jest.mocked(usePendingInvitationToken).mockReturnValue({ token, isLoading: false })
}

async function renderWithClient(token: string | undefined) {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const rendered = await renderHook(() => useInviteAcceptance(token), { wrapper })
  return { ...rendered, queryClient }
}

describe('useInviteAcceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)
    mockNotDeferred()
  })

  it('is "checking" while auth is loading or the token is not yet available', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: null, user: null, isLoading: true })
    mockAcceptInvitation({})

    const { result } = await renderWithClient('tok-abc')
    expect(result.current.status).toBe('checking')
  })

  it('unauthenticated: stores the token, seeds the query cache, and redirects to sign-in (without ever calling accept)', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: null, user: null, isLoading: false })
    const mutate = mockAcceptInvitation({})

    const { result } = await renderWithClient('tok-abc')
    await waitFor(() => expect(SecureStore.setItemAsync).toHaveBeenCalled())
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/sign-in'))

    const [key, storedValue] = jest.mocked(SecureStore.setItemAsync).mock.calls[0] as [string, string]
    expect(key).toBe('ourmoney.pendingInvitationToken')
    expect(JSON.parse(storedValue)).toMatchObject({ token: 'tok-abc' })
    expect(mutate).not.toHaveBeenCalled()
    expect(result.current.status).toBe('redirecting')
  })

  // Requirement 5: an invite opened while already authenticated (no
  // persisted pre-session token) keeps the original immediate-accept
  // behavior — the hardening below only changes the DEFERRED case.
  describe('direct (opened while already authenticated, no deferral)', () => {
    it('calls accept_invitation directly with the route-param token, no SecureStore round trip', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      const mutate = mockAcceptInvitation({
        result: { ok: true, household_id: 'household-1', already_member: false },
      })

      await renderWithClient('tok-abc')

      await waitFor(() => expect(mutate).toHaveBeenCalledWith('tok-abc', expect.anything()))
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    })

    it('navigates to the dashboard on success (both already_member values)', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockAcceptInvitation({ result: { ok: true, household_id: 'household-1', already_member: true } })

      await renderWithClient('tok-abc')
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'))
    })

    it('shows the already_in_household message without navigating, on accept while already in another household', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockAcceptInvitation({ result: { ok: false, error: 'already_in_household' } })

      const { result } = await renderWithClient('tok-abc')
      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.errorMessageKey).toBe('household.errors.alreadyInHousehold')
      expect(mockReplace).not.toHaveBeenCalledWith('/dashboard')
    })

    // The pre-existing regression scenario: a stored token for a dead
    // invitation resolves to the generic invalid_invitation failure, and —
    // critically — the pending token is cleared (SecureStore + query cache)
    // so a later auth-guard evaluation can never route back to
    // /invite/<token> on it. See features/auth/lib/authRedirect.test.ts's
    // matching pure-function proof for the guard-side half.
    it('clears the pending token after a dead invitation (invalid/expired/reused/revoked) resolves generically', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockAcceptInvitation({ result: { ok: false, error: 'invalid_invitation' } })

      const { result, queryClient } = await renderWithClient('dead-token')
      await waitFor(() => expect(result.current.status).toBe('error'))

      expect(result.current.errorMessageKey).toBe('invite.errors.invalidInvitation')
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
      await waitFor(() => expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull())
    })

    it('clears the pending token even on a genuine transport error, with a generic message', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockAcceptInvitation({ error: new Error('network error') })

      const { result } = await renderWithClient('tok-abc')
      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.errorMessageKey).toBe('invite.errors.generic')
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled()
    })

    it('only starts the flow once per mount, even across re-renders', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      const mutate = mockAcceptInvitation({
        result: { ok: true, household_id: 'household-1', already_member: false },
      })

      const queryClient = createTestQueryClient()
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
      const { rerender } = await renderHook(
        ({ token }: { token: string }) => useInviteAcceptance(token),
        {
          wrapper,
          initialProps: { token: 'tok-abc' },
        }
      )
      await rerender({ token: 'tok-abc' })
      await rerender({ token: 'tok-abc' })

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    })
  })

  // Hardening: an invite whose token was persisted to SecureStore BEFORE
  // this session existed (the user tapped it signed out, then completed
  // sign-in/sign-up) must never be auto-accepted just because
  // authentication succeeded — see docs/DECISIONS.md's Milestone 4
  // hardening note. Detected here by the persisted token matching the
  // route token, the same signal the auth guard already used to route the
  // user back to this screen in the first place.
  describe('deferred (resumed after a sign-in/sign-up detour)', () => {
    it('requirement 1: does not call accept_invitation while awaiting confirmation, even for a different signed-in user than whoever tapped the link', async () => {
      jest.mocked(useAuth).mockReturnValue({
        session: fakeSessionOtherUser,
        user: fakeSessionOtherUser.user,
        isLoading: false,
      })
      mockDeferred('tok-abc')
      const mutate = mockAcceptInvitation({
        result: { ok: true, household_id: 'household-1', already_member: false },
      })

      const { result } = await renderWithClient('tok-abc')

      expect(result.current.status).toBe('confirming')
      // Give any errant effect a chance to fire before asserting the negative.
      await waitFor(() => expect(result.current.status).toBe('confirming'))
      expect(mutate).not.toHaveBeenCalled()
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
    })

    it('requirement 2: confirm() accepts exactly once and clears the token', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockDeferred('tok-abc')
      const mutate = mockAcceptInvitation({
        result: { ok: true, household_id: 'household-1', already_member: false },
      })

      const { result, queryClient } = await renderWithClient('tok-abc')
      expect(result.current.status).toBe('confirming')

      await act(async () => {
        result.current.confirm()
        result.current.confirm() // a second tap/re-render must not double-accept
      })

      await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
      expect(mutate).toHaveBeenCalledWith('tok-abc', expect.anything())
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
      await waitFor(() => expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull())
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard'))
    })

    it('requirement 3: cancel() never calls accept_invitation, clears the token, and navigates away from the invite', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockDeferred('tok-abc')
      const mutate = mockAcceptInvitation({
        result: { ok: true, household_id: 'household-1', already_member: false },
      })

      const { result, queryClient } = await renderWithClient('tok-abc')
      expect(result.current.status).toBe('confirming')

      await act(async () => {
        result.current.cancel()
      })

      await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken'))
      await waitFor(() => expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull())
      // '/' hands the decision back to the already-mounted auth guard,
      // which re-evaluates with the now-cleared token and routes by real
      // household state — this hook never hardcodes onboarding vs.
      // dashboard itself.
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
      expect(mutate).not.toHaveBeenCalled()
    })

    // Adversarial-review regression: wired through the REAL
    // usePendingInvitationToken hook + a real QueryClient (no static mock),
    // so clearPendingInvitationToken's queryClient.setQueryData call
    // genuinely flips isDeferred from true to false mid-flight, exactly as
    // it does in production. Without cancel() setting startedRef BEFORE
    // that clear, this reproduces the confirmed bug: the shared accept
    // effect can't tell "never deferred" apart from "just cancelled," sees
    // isDeferred go false, and fires accept_invitation anyway — the user
    // who tapped Cancel ends up joined and redirected to /dashboard.
    it('regression: cancel() is not raced into auto-accepting by its own token-clear flipping isDeferred to false', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockImplementation(realUsePendingInvitationToken)
      jest.mocked(SecureStore.getItemAsync).mockResolvedValue(
        JSON.stringify({ token: 'tok-abc', storedAt: Date.now() })
      )
      const mutate = mockAcceptInvitation({
        result: { ok: true, household_id: 'household-1', already_member: false },
      })

      const { result } = await renderWithClient('tok-abc')
      await waitFor(() => expect(result.current.status).toBe('confirming'))

      await act(async () => {
        result.current.cancel()
      })

      await waitFor(() => expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken'))
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
      // Give the real query cache's notifyManager a chance to flush any
      // subsequent re-render before asserting the negative — this is
      // exactly the window the confirmed bug lived in. Wrapped in act()
      // since notifyManager's batched notification can trigger a real state
      // update during this window (query-core schedules it via a real
      // setTimeout, confirmed against @tanstack/query-core's source).
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(mutate).not.toHaveBeenCalled()
      expect(mockReplace).not.toHaveBeenCalledWith('/dashboard')
    })

    it('requirement 4: an expired/invalid deferred invite still fails generically and clears the token after confirmation', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      mockDeferred('dead-token')
      mockAcceptInvitation({ result: { ok: false, error: 'invalid_invitation' } })

      const { result, queryClient } = await renderWithClient('dead-token')
      expect(result.current.status).toBe('confirming')

      await act(async () => {
        result.current.confirm()
      })

      await waitFor(() => expect(result.current.status).toBe('error'))
      expect(result.current.errorMessageKey).toBe('invite.errors.invalidInvitation')
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
      await waitFor(() => expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull())
      expect(mockReplace).not.toHaveBeenCalledWith('/dashboard')
    })

    it('stays "checking" (not "confirming") while the persisted-token lookup is still in flight', async () => {
      jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
      jest.mocked(usePendingInvitationToken).mockReturnValue({ token: null, isLoading: true })
      mockAcceptInvitation({})

      const { result } = await renderWithClient('tok-abc')
      expect(result.current.status).toBe('checking')
    })
  })
})
