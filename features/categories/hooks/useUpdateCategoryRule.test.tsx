// Regression test for the previously-missing rule edit path — same mocking
// convention as useUpdateCategory.test.tsx / useUpdateSavingsGoalProgress.test.tsx.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUpdateCategoryRule } from './useUpdateCategoryRule'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useUpdateCategoryRule', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('updates category_id/field/operator/value for the given rule id', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateCategoryRule('household-1'), { wrapper })

    result.current.mutate({
      id: 'rule-1',
      categoryId: 'category-2',
      field: 'merchant_name',
      operator: 'equals',
      value: 'שופרסל',
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('category_rules')
    expect(builder.update).toHaveBeenCalledWith({
      category_id: 'category-2',
      field: 'merchant_name',
      operator: 'equals',
      value: 'שופרסל',
    })
    expect(builder.eq).toHaveBeenCalledWith('id', 'rule-1')
  })

  it('surfaces an error from Supabase without throwing out of the mutation', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('rls denied') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useUpdateCategoryRule('household-1'), { wrapper })

    result.current.mutate({
      id: 'rule-1',
      categoryId: 'category-2',
      field: 'description',
      operator: 'contains',
      value: 'x',
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
