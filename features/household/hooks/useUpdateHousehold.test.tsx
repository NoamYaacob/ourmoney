import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUpdateHousehold } from './useUpdateHousehold'
import { householdQueryKey } from './useHousehold'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useUpdateHousehold', () => {
  it('updates the household name scoped by household id', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateHousehold('household-1', 'user-1'), { wrapper })
    result.current.mutate('New Name')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('households')
    expect(builder.update).toHaveBeenCalledWith({ name: 'New Name' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'household-1')
  })

  it('invalidates the caller\'s useHousehold query on success', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function sharedWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = await renderHook(() => useUpdateHousehold('household-1', 'user-1'), {
      wrapper: sharedWrapper,
    })
    result.current.mutate('New Name')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: householdQueryKey('user-1') })
  })

  it('surfaces a genuine RLS/transport failure (e.g. non-admin) as a mutation error', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('not admin') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateHousehold('household-1', 'user-1'), { wrapper })
    result.current.mutate('New Name')

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
