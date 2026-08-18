// Regression coverage added alongside removing the unsafe `supabase.rpc`
// type-cast wrapper this hook used to carry (the cast's own justifying
// comment — "types/database.ts doesn't know this RPC name yet" — was
// factually false; the generated Functions union already types
// skip_recurring_occurrence). This proves the call now compiles and behaves
// correctly against the REAL generated types, with no cast standing between
// the mutation and Supabase's own typed `rpc()` overload.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { recurringTransactionsQueryKey } from './useRecurringTransactions'
import { useSkipRecurringOccurrence } from './useSkipRecurringOccurrence'

jest.mock('@/lib/supabase/client')

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useSkipRecurringOccurrence', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls the skip_recurring_occurrence RPC with the template id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, newNextDueDate: '2026-09-01' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    const queryClient = createTestQueryClient()

    const { result } = await renderHook(() => useSkipRecurringOccurrence('household-1'), {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate('recurring-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('skip_recurring_occurrence', { p_recurring_id: 'recurring-1' })
  })

  it('resolves newNextDueDate from the RPC result', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, newNextDueDate: '2026-09-01' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    const queryClient = createTestQueryClient()

    const { result } = await renderHook(() => useSkipRecurringOccurrence('household-1'), {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate('recurring-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: true, newNextDueDate: '2026-09-01' })
  })

  it('invalidates the recurring transactions query on success', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, newNextDueDate: '2026-09-01' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    const { result } = await renderHook(() => useSkipRecurringOccurrence('household-1'), {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate('recurring-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: recurringTransactionsQueryKey('household-1') })
  })

  it('surfaces the RPC-level ok:false error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'not_found' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    const queryClient = createTestQueryClient()

    const { result } = await renderHook(() => useSkipRecurringOccurrence('household-1'), {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate('recurring-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'not_found' }))
  })

  it('surfaces a transport-level RPC error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    const queryClient = createTestQueryClient()

    const { result } = await renderHook(() => useSkipRecurringOccurrence('household-1'), {
      wrapper: wrapper(queryClient),
    })
    result.current.mutate('recurring-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
