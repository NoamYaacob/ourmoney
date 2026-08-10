import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useHasHousehold, householdMembershipQueryKey } from './useHasHousehold'
import { usePeriodStore } from '@/store/periodStore'

jest.mock('@/lib/supabase/client')

async function renderWithClient(userId: string | undefined) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useHasHousehold(userId), { wrapper })
}

describe('useHasHousehold', () => {
  it('is undefined and not loading when there is no user id (no session yet)', async () => {
    const { result } = await renderWithClient(undefined)
    expect(result.current.hasHousehold).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })

  it('resolves true when the user has a household_members row', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: [{ user_id: 'user-1' }], error: null }) as unknown as ReturnType<
          typeof supabase.from
        >
      )

    const { result } = await renderWithClient('user-1')
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hasHousehold).toBe(true)
  })

  it('resolves false when the user has no household_members row (bootstrap, no household yet)', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result } = await renderWithClient('user-1')
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.hasHousehold).toBe(false)
  })

  // D9 (Milestone 6): a true -> false transition (membership revoked
  // mid-session) must fail closed — clear every financial query prefix and
  // reset the selected period, not merely update hasHousehold's own value.
  it('D9: clears financial query caches and resets the period when membership disappears mid-session', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: [{ user_id: 'user-1' }], error: null }) as unknown as ReturnType<
          typeof supabase.from
        >
      )

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = await renderHook(() => useHasHousehold('user-1'), { wrapper })
    await waitFor(() => expect(result.current.hasHousehold).toBe(true))

    // Seed financial caches as if the app had been happily fetching this
    // household's data all session.
    queryClient.setQueryData(['accounts', 'household-1'], [{ id: 'a1' }])
    queryClient.setQueryData(['transactions', 'household-1', {}], [{ id: 't1' }])
    usePeriodStore.setState({ selectedPeriodStart: '2020-01-01' })

    // Simulate the household-membership query re-observing removal — the
    // same mechanism a real refetch after an admin's DELETE would produce.
    // Not wrapped in a bare act(): TanStack Query's notifyManager batches
    // this notification onto a macrotask, so a synchronous act() here
    // returns before that task fires, leaving a pending update that leaks
    // into whichever test runs next in this file. waitFor already wraps its
    // polling in act() internally and keeps retrying until the update lands.
    queryClient.setQueryData(householdMembershipQueryKey('user-1'), false)

    await waitFor(() => expect(result.current.hasHousehold).toBe(false))
    expect(queryClient.getQueryData(['accounts', 'household-1'])).toBeUndefined()
    expect(queryClient.getQueryData(['transactions', 'household-1', {}])).toBeUndefined()
    expect(usePeriodStore.getState().selectedPeriodStart).not.toBe('2020-01-01')
  })

  it('does NOT clear caches on a fresh mount that resolves straight to false (no prior true observed)', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: [], error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    queryClient.setQueryData(['accounts', 'household-1'], [{ id: 'a1' }])

    const { result } = await renderHook(() => useHasHousehold('user-1'), { wrapper })
    await waitFor(() => expect(result.current.hasHousehold).toBe(false))

    // A brand-new user who never had a household must not have unrelated
    // financial caches wiped as a side effect of this hook simply resolving
    // to false for the first time.
    expect(queryClient.getQueryData(['accounts', 'household-1'])).toEqual([{ id: 'a1' }])
  })
})
