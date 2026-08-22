import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useDeleteInstallmentPlan } from './useDeleteInstallmentPlan'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useDeleteInstallmentPlan', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls delete_installment_plan with expected_version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteInstallmentPlan('household-1'), { wrapper })
    result.current.mutate({ id: 'plan-1', expectedVersion: 2 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('delete_installment_plan', {
      p_id: 'plan-1',
      p_expected_version: 2,
    })
  })

  it('throws a ConcurrencyError(conflict) on a stale delete — a stale client can never silently remove a newer version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteInstallmentPlan('household-1'), { wrapper })
    result.current.mutate({ id: 'plan-1', expectedVersion: 1 })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
  })
})
