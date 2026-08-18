// Milestone A: fetchFreshTransactionsForAccount is the CSV import commit-time
// duplicate re-check's data source — a direct, uncached Supabase read, not
// a TanStack Query hook.
// Search+Filters milestone: useTransactions itself now needs one direct
// test — the new `uncategorized` filter — since it's the one predicate
// this milestone adds to the query builder itself, not just to the pure
// filter-composition helpers (transactionFilters.test.ts).

import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { fetchFreshTransactionsForAccount, useTransactions } from './useTransactions'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTransactions — uncategorized filter', () => {
  it('queries category_id IS NULL when uncategorized is set, and does not also apply categoryId', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useTransactions('household-1', { uncategorized: true }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(builder.is).toHaveBeenCalledWith('category_id', null)
    expect(builder.eq).not.toHaveBeenCalledWith('category_id', expect.anything())
  })

  it('queries a specific category_id when categoryId is set without uncategorized', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useTransactions('household-1', { categoryId: 'cat-1' }), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(builder.eq).toHaveBeenCalledWith('category_id', 'cat-1')
    expect(builder.is).not.toHaveBeenCalled()
  })
})

describe('fetchFreshTransactionsForAccount', () => {
  it('queries transactions scoped to the household and account, selecting only the dedup-relevant columns', async () => {
    const rows = [{ account_id: 'acct-1', txn_date: '2026-01-15', amount_agorot: -2000, description: 'קפה' }]
    const builder = createQueryBuilderMock({ data: rows, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const result = await fetchFreshTransactionsForAccount('household-1', 'acct-1')

    expect(supabase.from).toHaveBeenCalledWith('transactions')
    expect(builder.select).toHaveBeenCalledWith('account_id, txn_date, amount_agorot, description')
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
    expect(builder.eq).toHaveBeenCalledWith('account_id', 'acct-1')
    expect(result).toEqual(rows)
  })

  it('returns an empty array when the query resolves with no data', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const result = await fetchFreshTransactionsForAccount('household-1', 'acct-1')
    expect(result).toEqual([])
  })

  it('throws on a Supabase error rather than silently returning an empty/partial snapshot', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('network error') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await expect(fetchFreshTransactionsForAccount('household-1', 'acct-1')).rejects.toThrow('network error')
  })
})
