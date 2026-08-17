// Covers the completion-transition semantics required by the approved M7
// design: goal.completed fires only on the false -> true transition of the
// DB-trigger-derived is_completed; every other progress write emits
// goal.progress_updated instead. Migration 009/ADR-036 moves the write
// behind update_savings_goal_progress(), which now returns
// version/currentAgorot/isCompleted together in its JSON result instead of
// a raw .select().single() row — this file's transition-detection logic
// must keep working unchanged against that new shape, and every call must
// carry expectedVersion.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useUpdateSavingsGoalProgress } from './useUpdateSavingsGoalProgress'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function mockRpcResult(version: number, currentAgorot: number, isCompleted: boolean) {
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: { ok: true, version, currentAgorot, isCompleted },
    error: null,
  } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
}

describe('useUpdateSavingsGoalProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('sends expected_version and the new current_agorot to update_savings_goal_progress', async () => {
    mockRpcResult(2, 100_000, true)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 1,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 100_000,
      wasCompleted: false,
      targetAgorot: 100_000,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('update_savings_goal_progress', {
      p_id: 'goal-1',
      p_expected_version: 1,
      p_current_agorot: 100_000,
    })
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version and emits nothing', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })
    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 1,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 100_000,
      wasCompleted: false,
      targetAgorot: 100_000,
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
    expect(emit).not.toHaveBeenCalled()
  })

  it('below -> above emits goal.completed exactly once', async () => {
    mockRpcResult(2, 100_000, true)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 1,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 100_000,
      wasCompleted: false,
      targetAgorot: 100_000,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'goal.completed', payload: { goalId: 'goal-1' } })
    )
  })

  it('above -> above (still complete) does not re-emit goal.completed', async () => {
    mockRpcResult(2, 120_000, true)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 1,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 120_000,
      wasCompleted: true,
      targetAgorot: 100_000,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'goal.progress_updated' }))
  })

  it('above -> below flips completion silently (progress_updated, no goal.completed)', async () => {
    mockRpcResult(2, 40_000, false)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 1,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 40_000,
      wasCompleted: true,
      targetAgorot: 100_000,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'goal.progress_updated' }))
  })

  it('below -> above -> below -> above emits goal.completed exactly twice, once per upward crossing', async () => {
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    mockRpcResult(2, 100_000, true)
    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 1,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 100_000,
      wasCompleted: false,
      targetAgorot: 100_000,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    mockRpcResult(3, 50_000, false)
    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 2,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 50_000,
      wasCompleted: true,
      targetAgorot: 100_000,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    mockRpcResult(4, 100_000, true)
    result.current.mutate({
      goalId: 'goal-1',
      expectedVersion: 3,
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 100_000,
      wasCompleted: false,
      targetAgorot: 100_000,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const completedCalls = jest
      .mocked(emit)
      .mock.calls.filter(([event]) => (event as { type: string }).type === 'goal.completed')
    expect(completedCalls).toHaveLength(2)
  })
})
