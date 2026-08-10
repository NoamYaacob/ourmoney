import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useHouseholdMembers } from './useHouseholdMembers'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const rows = [
  {
    user_id: 'user-1',
    role: 'admin',
    joined_at: '2026-01-01T00:00:00Z',
    profiles: { display_name: 'דנה כהן', avatar_url: null },
  },
  {
    user_id: 'user-2',
    role: 'member',
    joined_at: '2026-01-02T00:00:00Z',
    profiles: { display_name: 'יוסי כהן', avatar_url: 'https://example.com/a.png' },
  },
]

describe('useHouseholdMembers', () => {
  it('is empty/not loading and does not query when householdId is null or undefined', async () => {
    const { result } = await renderHook(() => useHouseholdMembers(null), { wrapper })
    expect(result.current.members).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('maps household_members joined with profiles into the flat UI shape', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: rows, error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result } = await renderHook(() => useHouseholdMembers('household-1'), { wrapper })
    await waitFor(() => expect(result.current.members).toHaveLength(2))

    expect(result.current.members).toEqual([
      { userId: 'user-1', role: 'admin', joinedAt: '2026-01-01T00:00:00Z', displayName: 'דנה כהן', avatarUrl: null },
      {
        userId: 'user-2',
        role: 'member',
        joinedAt: '2026-01-02T00:00:00Z',
        displayName: 'יוסי כהן',
        avatarUrl: 'https://example.com/a.png',
      },
    ])
  })

  it('scopes the query to exactly the given household id — a pure function of its argument', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useHouseholdMembers('household-42'), { wrapper })
    await waitFor(() => expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-42'))
  })

  it('switching the householdId argument across renders re-queries by the new id, never reusing a previous id\'s cached data', async () => {
    const householdA = [rows[0]]
    const householdB = [rows[1]]

    jest
      .mocked(supabase.from)
      .mockReturnValueOnce(
        createQueryBuilderMock({ data: householdA, error: null }) as unknown as ReturnType<typeof supabase.from>
      )
      .mockReturnValueOnce(
        createQueryBuilderMock({ data: householdB, error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result, rerender } = await renderHook(
      ({ householdId }: { householdId: string }) => useHouseholdMembers(householdId),
      { wrapper, initialProps: { householdId: 'household-A' } }
    )
    await waitFor(() => expect(result.current.members).toHaveLength(1))
    expect(result.current.members[0]?.userId).toBe('user-1')

    await rerender({ householdId: 'household-B' })
    await waitFor(() => expect(result.current.members[0]?.userId).toBe('user-2'))
    expect(result.current.members).toHaveLength(1)
  })
})
