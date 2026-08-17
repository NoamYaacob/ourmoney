import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useSetRecurringTransactionActive } from './useSetRecurringTransactionActive'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useSetRecurringTransactionActive', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls set_recurring_transaction_active with expected_version and the new is_active value', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 2 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useSetRecurringTransactionActive('household-1'), { wrapper })
    result.current.mutate({ id: 'rec-1', expectedVersion: 1, isActive: false })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('set_recurring_transaction_active', {
      p_id: 'rec-1',
      p_expected_version: 1,
      p_is_active: false,
    })
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useSetRecurringTransactionActive('household-1'), { wrapper })
    result.current.mutate({ id: 'rec-1', expectedVersion: 1, isActive: true })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
  })
})
