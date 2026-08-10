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
})
