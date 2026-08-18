import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useDeleteSavingsGoal } from './useDeleteSavingsGoal'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useDeleteSavingsGoal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls delete_savings_goal with expected_version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteSavingsGoal('household-1'), { wrapper })
    result.current.mutate({ id: 'goal-1', expectedVersion: 2 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('delete_savings_goal', {
      p_id: 'goal-1',
      p_expected_version: 2,
    })
  })

  it('throws a ConcurrencyError(conflict) on a stale delete', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteSavingsGoal('household-1'), { wrapper })
    result.current.mutate({ id: 'goal-1', expectedVersion: 1 })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
  })
})
