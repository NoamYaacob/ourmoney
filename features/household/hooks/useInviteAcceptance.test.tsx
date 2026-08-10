import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SecureStore from 'expo-secure-store'
import type { Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { useInviteAcceptance } from './useInviteAcceptance'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useAcceptInvitation } from './useAcceptInvitation'
import { pendingInvitationTokenQueryKey } from '../lib/pendingInvitationToken'
import type { AcceptInvitationResult } from './useAcceptInvitation'

// useAuth.ts and useAcceptInvitation.ts are automocked (no factory), which
// still requires evaluating their real module bodies to introspect exports
// — both transitively import lib/supabase/client.ts, whose real module
// creates a Supabase client at import time and throws without env vars.
// Mocking the client itself (the existing manual mock) short-circuits that.
jest.mock('@/lib/supabase/client')
jest.mock('expo-secure-store')
jest.mock('@/features/auth/hooks/useAuth')
jest.mock('./useAcceptInvitation')

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

const fakeSession = { user: { id: 'user-1' } } as Session

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

async function renderWithClient(token: string | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

  it('authenticated: calls accept_invitation directly with the route-param token, no SecureStore round trip', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    const mutate = mockAcceptInvitation({
      result: { ok: true, household_id: 'household-1', already_member: false },
    })

    await renderWithClient('tok-abc')

    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
    expect(mutate).toHaveBeenCalledWith('tok-abc', expect.anything())
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

  // The required regression scenario: a stored token for a dead invitation
  // resolves to the generic invalid_invitation failure, and — critically —
  // the pending token is cleared (SecureStore + query cache) so a later
  // auth-guard evaluation can never route back to /invite/<token> on it.
  // See features/auth/lib/authRedirect.test.ts's matching pure-function
  // proof for the guard-side half of this guarantee.
  it('clears the pending token after a dead invitation (invalid/expired/reused/revoked) resolves generically', async () => {
    jest.mocked(useAuth).mockReturnValue({ session: fakeSession, user: fakeSession.user, isLoading: false })
    mockAcceptInvitation({ result: { ok: false, error: 'invalid_invitation' } })

    const { result, queryClient } = await renderWithClient('dead-token')
    await waitFor(() => expect(result.current.status).toBe('error'))

    expect(result.current.errorMessageKey).toBe('invite.errors.invalidInvitation')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
    await waitFor(() =>
      expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull()
    )
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

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
