import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useUpdateRecurringTransaction } from './useUpdateRecurringTransaction'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const INPUT = {
  id: 'rec-1',
  expectedVersion: 1,
  accountId: 'acct-1',
  categoryId: 'cat-1',
  amountAgorot: -7500,
  description: 'ארנונה עירייה',
  isShared: true,
  frequency: 'monthly' as const,
  dayOfMonth: 1,
}

describe('useUpdateRecurringTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls update_recurring_transaction with expected_version and every identity field', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 2 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateRecurringTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('update_recurring_transaction', {
      p_id: 'rec-1',
      p_expected_version: 1,
      p_account_id: 'acct-1',
      p_category_id: 'cat-1',
      p_amount_agorot: -7500,
      p_description: 'ארנונה עירייה',
      p_is_shared: true,
      p_frequency: 'monthly',
      p_day_of_month: 1,
    })
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateRecurringTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
  })

  it('surfaces a validation error (e.g. invalid_frequency) as a plain, non-conflict Error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'invalid_frequency' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateRecurringTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).not.toBeInstanceOf(ConcurrencyError)
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'invalid_frequency' }))
  })
})
