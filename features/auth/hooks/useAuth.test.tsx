import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from './useAuth'

jest.mock('@/lib/supabase/client')

const fakeSession = { user: { id: 'user-1' } } as Session

async function renderWithClient() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useAuth(), { wrapper })
}

describe('useAuth', () => {
  let authStateCallback: (event: AuthChangeEvent, session: Session | null) => void
  const unsubscribe = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(supabase.auth.onAuthStateChange).mockImplementation((callback) => {
      authStateCallback = callback
      return { data: { subscription: { id: 'sub-1', callback, unsubscribe } } } as ReturnType<
        typeof supabase.auth.onAuthStateChange
      >
    })
  })

  it('restores an existing session from getSession() on mount (session restore)', async () => {
    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: fakeSession },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)

    const { result } = await renderWithClient()

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).toEqual(fakeSession)
    expect(result.current.user).toEqual(fakeSession.user)
  })

  it('resolves to no session when none exists (bootstrap with no prior session)', async () => {
    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)

    const { result } = await renderWithClient()
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.session).toBeNull()
    expect(result.current.user).toBeNull()
  })

  it('reacts to auth state changes (sign-in, sign-out) after mount', async () => {
    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)

    const { result } = await renderWithClient()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).toBeNull()

    authStateCallback('SIGNED_IN', fakeSession)
    await waitFor(() => expect(result.current.session).toEqual(fakeSession))

    authStateCallback('SIGNED_OUT', null)
    await waitFor(() => expect(result.current.session).toBeNull())
  })

  it('unsubscribes on unmount and re-subscribes cleanly across repeated mounts (reopen)', async () => {
    jest.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>)

    const first = await renderWithClient()
    await waitFor(() => expect(first.result.current.isLoading).toBe(false))
    await first.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    const second = await renderWithClient()
    await waitFor(() => expect(second.result.current.isLoading).toBe(false))
    await second.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(2)
  })
})
