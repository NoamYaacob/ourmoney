import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useUpdateSavingsGoal } from './useUpdateSavingsGoal'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const INPUT = {
  id: 'goal-1',
  expectedVersion: 1,
  name: 'טיול לחו״ל',
  targetAgorot: 800000,
  accountId: null,
  targetDate: null,
  icon: null,
  color: null,
  progressSource: 'manual' as const,
}

describe('useUpdateSavingsGoal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls update_savings_goal with expected_version and every identity field', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 2 },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateSavingsGoal('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('update_savings_goal', {
      p_id: 'goal-1',
      p_expected_version: 1,
      p_name: 'טיול לחו״ל',
      p_target_agorot: 800000,
      p_account_id: null,
      p_target_date: null,
      p_icon: null,
      p_color: null,
      p_progress_source: 'manual',
    })
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateSavingsGoal('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
  })
})
