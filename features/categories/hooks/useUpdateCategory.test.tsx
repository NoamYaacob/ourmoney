// Regression test for the previously-missing category edit path — mirrors
// useUpdateAccount.ts's shape (update().eq('id', id)) and the mocking
// convention established by useUpdateSavingsGoalProgress.test.tsx.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUpdateCategory } from './useUpdateCategory'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useUpdateCategory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('updates only name_he for the given category id', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateCategory('household-1'), { wrapper })

    result.current.mutate({ id: 'category-1', nameHe: 'תחביבים חדש' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('categories')
    expect(builder.update).toHaveBeenCalledWith({ name_he: 'תחביבים חדש' })
    expect(builder.eq).toHaveBeenCalledWith('id', 'category-1')
  })

  it('surfaces an error from Supabase without throwing out of the mutation', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('rls denied') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateCategory('household-1'), { wrapper })

    result.current.mutate({ id: 'category-1', nameHe: 'x' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
