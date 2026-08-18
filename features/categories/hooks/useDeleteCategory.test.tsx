// Regression test for a confirmed bug: category_rules.category_id is
// ON DELETE CASCADE (migration 002), so deleting a category deletes its
// rules server-side in the same statement — but the mutation only ever
// invalidated the categories query, never the rules query, leaving an
// orphaned-looking rule row visible in the UI until something else happened
// to refetch it (its "THEN" line rendering `undefined` for the deleted
// category's name). Mirrors useUpdateCategory.test.tsx's mocking convention.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { categoriesQueryKey } from './useCategories'
import { categoryRulesQueryKey } from './useCategoryRules'
import { useDeleteCategory } from './useDeleteCategory'

jest.mock('@/lib/supabase/client')

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useDeleteCategory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('deletes the category by id', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)
    const queryClient = createTestQueryClient()

    const { result } = await renderHook(() => useDeleteCategory('household-1'), { wrapper: wrapper(queryClient) })
    result.current.mutate('category-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('categories')
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('id', 'category-1')
  })

  it('invalidates both the categories query and the category-rules query on success', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)
    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { result } = await renderHook(() => useDeleteCategory('household-1'), { wrapper: wrapper(queryClient) })
    result.current.mutate('category-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: categoriesQueryKey('household-1') })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: categoryRulesQueryKey('household-1') })
  })

  it('does not invalidate either query on failure', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('rls denied') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)
    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { result } = await renderHook(() => useDeleteCategory('household-1'), { wrapper: wrapper(queryClient) })
    result.current.mutate('category-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
