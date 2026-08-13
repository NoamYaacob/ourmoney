// Regression test for a confirmed gap: the hook used to never expose
// query.error, so a failed fetch fell back to `uncategorized: []` —
// indistinguishable from a genuinely empty queue at the call site
// (app/(app)/budgets/index.tsx rendered the same "🎉 all categorized"
// success EmptyState either way).
import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useUncategorizedTransactions } from './useUncategorizedTransactions'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useUncategorizedTransactions', () => {
  it('returns the fetched rows with no error on success', async () => {
    const rows = [{ id: 'txn-1', description: 'קפה', amount_agorot: -2000, txn_date: '2026-01-01' }]
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: rows, error: null }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result } = await renderHook(() => useUncategorizedTransactions('household-1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.uncategorized).toEqual(rows)
    expect(result.current.error).toBeNull()
  })

  it('exposes the query error instead of silently falling back to an empty array on fetch failure', async () => {
    const queryError = new Error('network down')
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({ data: null, error: queryError }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result } = await renderHook(() => useUncategorizedTransactions('household-1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // The false-success fallback this test guards against: data must NOT
    // be silently treated as a genuinely empty queue without the error
    // being surfaced too.
    expect(result.current.uncategorized).toEqual([])
    expect(result.current.error).toBeTruthy()
  })
})
