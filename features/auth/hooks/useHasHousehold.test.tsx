import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useHasHousehold } from './useHasHousehold'

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
})
