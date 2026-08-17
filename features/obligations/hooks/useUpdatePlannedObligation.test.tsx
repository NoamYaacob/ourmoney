import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useUpdatePlannedObligation } from './useUpdatePlannedObligation'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const INPUT = {
  id: 'ob-1',
  expectedVersion: 3,
  name: 'ארנונה',
  amountAgorot: 180000,
  dueDate: '2026-09-10',
  categoryId: 'cat-1',
  accountId: 'acc-1',
  isShared: true,
  notes: null,
}

describe('useUpdatePlannedObligation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls update_planned_obligation with expected_version and every field', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 4 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdatePlannedObligation('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('update_planned_obligation', {
      p_id: 'ob-1',
      p_expected_version: 3,
      p_name: 'ארנונה',
      p_amount_agorot: 180000,
      p_due_date: '2026-09-10',
      p_category_id: 'cat-1',
      p_account_id: 'acc-1',
      p_is_shared: true,
      p_notes: null,
    })
    expect(result.current.data).toEqual({ version: 4 })
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version and does not invalidate the list cache', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = await renderHook(() => useUpdatePlannedObligation('household-1'), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ConcurrencyError)
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('throws a ConcurrencyError(not_found) when the row no longer exists in this household', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'not_found' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdatePlannedObligation('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('not_found')
  })

  it('invalidates the obligations list only after a successful mutation', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 4 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    const { result } = await renderHook(() => useUpdatePlannedObligation('household-1'), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['plannedObligations', 'household-1'] })
  })
})
