import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUpdateProfile } from './useUpdateProfile'
import { profileQueryKey } from './useProfile'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useUpdateProfile', () => {
  it('updates the display name scoped to the caller\'s own profile row', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateProfile('user-1'), { wrapper })
    result.current.mutate('Dana Cohen')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(builder.update).toHaveBeenCalledWith({ display_name: 'Dana Cohen' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('invalidates the caller\'s useProfile query on success', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function sharedWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = await renderHook(() => useUpdateProfile('user-1'), { wrapper: sharedWrapper })
    result.current.mutate('Dana Cohen')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: profileQueryKey('user-1') })
  })

  it('surfaces a genuine RLS/transport failure as a mutation error', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('rls violation') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateProfile('user-1'), { wrapper })
    result.current.mutate('Dana Cohen')

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
