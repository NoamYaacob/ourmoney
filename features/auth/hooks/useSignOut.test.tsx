import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SecureStore from 'expo-secure-store'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useSignOut } from './useSignOut'
import { useHouseholdStore } from '@/store/householdStore'
import { pendingInvitationTokenQueryKey } from '@/features/household/lib/pendingInvitationToken'

jest.mock('@/lib/supabase/client')
jest.mock('expo-secure-store')

describe('useSignOut', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useHouseholdStore.setState({ householdId: null })
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)
  })

  it('calls supabase.auth.signOut', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signOut>>)

    const { result } = await renderHook(() => useSignOut(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  // Regression: a stale householdId/household query cache must not survive
  // a sign-out and leak into whatever the next signed-in user on this
  // device sees (architecture review finding).
  it('clears the household store and household-scoped query cache on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signOut>>)

    useHouseholdStore.setState({ householdId: 'household-1' })
    queryClient.setQueryData(['household', 'current', 'user-1'], { household_id: 'household-1' })
    queryClient.setQueryData(['auth', 'household-membership', 'user-1'], true)

    const { result } = await renderHook(() => useSignOut(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useHouseholdStore.getState().householdId).toBeNull()
    expect(queryClient.getQueryData(['household', 'current', 'user-1'])).toBeUndefined()
    expect(queryClient.getQueryData(['auth', 'household-membership', 'user-1'])).toBeUndefined()
  })

  // Regression (adversarial review): a pending invitation token stored by a
  // prior user of a shared device must not be silently inherited by the
  // next person who signs in on it and auto-join them to a household they
  // never agreed to join.
  it('clears the pending invitation token on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signOut>>)
    queryClient.setQueryData(pendingInvitationTokenQueryKey, 'stale-token')

    const { result } = await renderHook(() => useSignOut(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
    await waitFor(() =>
      expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull()
    )
  })

  it('does not clear the household store or cache on a failed sign-out', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.auth.signOut>>)

    useHouseholdStore.setState({ householdId: 'household-1' })
    queryClient.setQueryData(['household', 'current', 'user-1'], { household_id: 'household-1' })

    const { result } = await renderHook(() => useSignOut(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useHouseholdStore.getState().householdId).toBe('household-1')
    expect(queryClient.getQueryData(['household', 'current', 'user-1'])).toEqual({
      household_id: 'household-1',
    })
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })
})
