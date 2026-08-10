import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useHousehold } from './useHousehold'
import { useHouseholdStore } from '@/store/householdStore'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useHousehold', () => {
  beforeEach(() => {
    useHouseholdStore.setState({ householdId: null })
  })

  it('is null/not loading when there is no user id (no session yet)', async () => {
    const { result } = await renderHook(() => useHousehold(undefined), { wrapper })
    expect(result.current.householdId).toBeNull()
    expect(result.current.household).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(useHouseholdStore.getState().householdId).toBeNull()
  })

  it('bootstraps household + household id and syncs the store (household query bootstrap)', async () => {
    const membershipRow = {
      household_id: 'household-1',
      role: 'admin',
      households: { id: 'household-1', name: 'Cohen', currency: 'ILS' },
    }
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: membershipRow, error: null }) as unknown as ReturnType<
          typeof supabase.from
        >
      )

    const { result } = await renderHook(() => useHousehold('user-1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.householdId).toBe('household-1')
    expect(result.current.household).toEqual(membershipRow.households)
    expect(useHouseholdStore.getState().householdId).toBe('household-1')
  })

  it('resolves null when the user has no household row yet', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result } = await renderHook(() => useHousehold('user-1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.householdId).toBeNull()
    expect(result.current.household).toBeNull()
  })

  it('scopes the query to the caller-supplied user id (no cross-household exposure client-side)', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useHousehold('user-42'), { wrapper })
    await waitFor(() => expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-42'))
  })

  // Required regression (user-specified): a stale householdId from a
  // previous account must never drive what the next account's screens
  // fetch/render. useHousehold's query key is scoped by the CURRENT
  // user id (['household','current',userId]) — switching users is a
  // different cache key entirely, so query.data for the new key starts
  // undefined, and householdId correctly reads null during the gap before
  // the new user's household resolves, never the previous user's id.
  it('account switch: householdId reads null (never the previous user\'s id) until the new user\'s household resolves', async () => {
    const householdA = { household_id: 'household-A', role: 'admin', households: { id: 'household-A', name: 'A' } }
    const householdB = { household_id: 'household-B', role: 'member', households: { id: 'household-B', name: 'B' } }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function sharedWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: householdA, error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result, rerender } = await renderHook(({ userId }: { userId: string }) => useHousehold(userId), {
      wrapper: sharedWrapper,
      initialProps: { userId: 'user-A' },
    })
    await waitFor(() => expect(result.current.householdId).toBe('household-A'))

    // Simulate sign-out -> a different user signing in: switch the user id
    // (a fresh mount would behave identically; this proves the property
    // holds for a re-render of the SAME hook instance too) while the new
    // user's household query has not resolved yet.
    let resolveB!: () => void
    const pendingB = new Promise<void>((resolve) => {
      resolveB = resolve
    })
    jest.mocked(supabase.from).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockReturnThis(),
      then: (onfulfilled: (value: { data: typeof householdB; error: null }) => unknown) =>
        pendingB.then(() => onfulfilled({ data: householdB, error: null })),
    } as unknown as ReturnType<typeof supabase.from>)

    await rerender({ userId: 'user-B' })

    // Before user B's household query resolves: must read null, NEVER
    // household A's id.
    expect(result.current.householdId).toBeNull()
    expect(result.current.household).toBeNull()

    resolveB()
    await waitFor(() => expect(result.current.householdId).toBe('household-B'))
    expect(result.current.household).toEqual(householdB.households)
  })
})
