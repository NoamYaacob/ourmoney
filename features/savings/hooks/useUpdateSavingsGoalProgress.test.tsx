// Covers the completion-transition semantics required by the approved M7
// design: goal.completed fires only on the false -> true transition of the
// DB-trigger-derived is_completed; every other progress write emits
// goal.progress_updated instead.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { emit } from '@/lib/events/dispatcher'
import { useUpdateSavingsGoalProgress } from './useUpdateSavingsGoalProgress'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function mockUpdateResult(current_agorot: number, is_completed: boolean) {
  jest.mocked(supabase.from).mockReturnValue(
    createQueryBuilderMock({
      data: { id: 'goal-1', current_agorot, target_agorot: 100_000, is_completed },
      error: null,
    }) as unknown as ReturnType<typeof supabase.from>
  )
}

describe('useUpdateSavingsGoalProgress', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('below -> above emits goal.completed exactly once', async () => {
    mockUpdateResult(100_000, true)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
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
    mockUpdateResult(120_000, true)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
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
    mockUpdateResult(40_000, false)
    const { result } = await renderHook(() => useUpdateSavingsGoalProgress('household-1'), { wrapper })

    result.current.mutate({
      goalId: 'goal-1',
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

    mockUpdateResult(100_000, true)
    result.current.mutate({
      goalId: 'goal-1',
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 100_000,
      wasCompleted: false,
      targetAgorot: 100_000,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    mockUpdateResult(50_000, false)
    result.current.mutate({
      goalId: 'goal-1',
      householdId: 'household-1',
      actorId: 'user-1',
      currentAgorot: 50_000,
      wasCompleted: true,
      targetAgorot: 100_000,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    mockUpdateResult(100_000, true)
    result.current.mutate({
      goalId: 'goal-1',
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
