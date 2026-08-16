import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { emit } from '@/lib/events/dispatcher'
import { useBulkUpdateTransactionCategory } from './useBulkUpdateTransactionCategory'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useBulkUpdateTransactionCategory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('issues a single UPDATE with category_id and matched_rule_id: null, scoped by id-in-list and household', async () => {
    const builder = createQueryBuilderMock({ data: [{ id: 't1' }, { id: 't2' }], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: ['t1', 't2'], categoryId: 'cat-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('transactions')
    expect(builder.update).toHaveBeenCalledWith({ category_id: 'cat-1', matched_rule_id: null })
    expect(builder.in).toHaveBeenCalledWith('id', ['t1', 't2'])
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
    expect(result.current.data).toEqual({ updatedIds: ['t1', 't2'], missingIds: [] })
  })

  it('supports assigning "uncategorized" (categoryId: null)', async () => {
    const builder = createQueryBuilderMock({ data: [{ id: 't1' }], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: ['t1'], categoryId: null })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(builder.update).toHaveBeenCalledWith({ category_id: null, matched_rule_id: null })
  })

  it('emits one transaction.updated event per actually-updated row, matching useUpdateTransaction\'s event shape', async () => {
    const builder = createQueryBuilderMock({ data: [{ id: 't1' }, { id: 't2' }], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: ['t1', 't2'], categoryId: 'cat-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transaction.updated',
        householdId: 'household-1',
        payload: { transactionId: 't1', changedFields: ['categoryId'] },
      })
    )
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transaction.updated',
        payload: { transactionId: 't2', changedFields: ['categoryId'] },
      })
    )
  })

  it('reports missingIds honestly when the UPDATE touches fewer rows than were selected (e.g. a concurrently-deleted row)', async () => {
    // Selected 3, only 2 rows actually matched/updated.
    const builder = createQueryBuilderMock({ data: [{ id: 't1' }, { id: 't2' }], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: ['t1', 't2', 't3'], categoryId: 'cat-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ updatedIds: ['t1', 't2'], missingIds: ['t3'] })
    // Only the actually-updated rows get an event — t3 was never touched.
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('does not query at all for an empty selection', async () => {
    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: [], categoryId: 'cat-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).not.toHaveBeenCalled()
    expect(result.current.data).toEqual({ updatedIds: [], missingIds: [] })
    expect(emit).not.toHaveBeenCalled()
  })

  it('treats the whole operation as failed when the UPDATE statement itself errors — no partial success is faked', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('rls denied') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: ['t1', 't2'], categoryId: 'cat-1' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(emit).not.toHaveBeenCalled()
  })

  // This is what makes the "filter = ללא קטגוריה -> select -> categorize ->
  // rows disappear from the uncategorized-filtered results" workflow work
  // in the real app: the Transactions screen's useTransactions query re-runs
  // with the SAME active filter after invalidation, and a row that's no
  // longer uncategorized no longer matches it.
  it('invalidates the transactions and budgets/progress query keys on success', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    const builder = createQueryBuilderMock({ data: [{ id: 't1' }], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useBulkUpdateTransactionCategory('household-1'), { wrapper: localWrapper })
    result.current.mutate({ householdId: 'household-1', transactionIds: ['t1'], categoryId: 'cat-1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions', 'household-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['budgets', 'progress', 'household-1'] })
  })
})
