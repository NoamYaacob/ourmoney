import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useCreateHousehold } from './useCreateHousehold'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHouseholdStore } from '@/store/householdStore'

jest.mock('@/lib/supabase/client')
jest.mock('@/features/auth/hooks/useAuth')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCreateHousehold', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ householdId: null })
    jest
      .mocked(useAuth)
      .mockReturnValue({ session: null, user: { id: 'user-1' } as never, isLoading: false })
  })

  it('creates a household successfully and stores the resulting id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_id: 'household-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateHousehold(), { wrapper })
    result.current.mutate('משפחת כהן')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('create_household', { p_name: 'משפחת כהן' })
    expect(useHouseholdStore.getState().householdId).toBe('household-1')
  })

  it('resolves already_in_household without storing an id (duplicate attempt / already a member)', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'already_in_household' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateHousehold(), { wrapper })
    result.current.mutate('משפחת כהן')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: false, error: 'already_in_household' })
    expect(useHouseholdStore.getState().householdId).toBeNull()
  })

  it('resolves invalid_name without storing an id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'invalid_name' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateHousehold(), { wrapper })
    result.current.mutate('')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: false, error: 'invalid_name' })
    expect(useHouseholdStore.getState().householdId).toBeNull()
  })

  it('surfaces a genuine transport failure as a mutation error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateHousehold(), { wrapper })
    result.current.mutate('משפחת כהן')

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  // Guard cache invalidation — the literal fix for the Milestone 3 TODO:
  // without this, the guard never routes a freshly-onboarded user forward
  // until an app restart.
  it('invalidates the household-membership and household query keys on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_id: 'household-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateHousehold(), { wrapper: localWrapper })
    result.current.mutate('משפחת כהן')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'household-membership', 'user-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['household', 'current', 'user-1'] })
  })
})
