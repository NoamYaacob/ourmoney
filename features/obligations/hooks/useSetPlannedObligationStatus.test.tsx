import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useSetPlannedObligationStatus } from './useSetPlannedObligationStatus'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useSetPlannedObligationStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls set_planned_obligation_status with expected_version and the new status', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 2 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useSetPlannedObligationStatus('household-1'), { wrapper })
    result.current.mutate({ id: 'ob-1', expectedVersion: 1, status: 'completed' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('set_planned_obligation_status', {
      p_id: 'ob-1',
      p_expected_version: 1,
      p_status: 'completed',
    })
    expect(result.current.data).toEqual({ version: 2 })
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useSetPlannedObligationStatus('household-1'), { wrapper })
    result.current.mutate({ id: 'ob-1', expectedVersion: 1, status: 'cancelled' })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ConcurrencyError)
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
  })
})
