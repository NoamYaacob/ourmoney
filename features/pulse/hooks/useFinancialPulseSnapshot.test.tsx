import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useFinancialPulseSnapshot, useRecordFinancialPulseSnapshot } from './useFinancialPulseSnapshot'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('useFinancialPulseSnapshot — read', () => {
  it('queries scoped to both household_id and user_id, and maps a real row', async () => {
    const builder = createQueryBuilderMock({
      data: { safe_to_spend_agorot: 491800, captured_at: '2026-08-10T00:00:00Z' },
      error: null,
    })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useFinancialPulseSnapshot('household-1', 'user-1'), { wrapper })
    await waitFor(() => expect(result.current.hasData).toBe(true))

    expect(supabase.from).toHaveBeenCalledWith('financial_pulse_snapshots')
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(result.current.previousSnapshot).toEqual({ safeToSpendAgorot: 491800, capturedAt: '2026-08-10T00:00:00Z' })
  })

  it('resolves a genuinely absent row (first visit) as previousSnapshot: null, distinct from still-loading', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useFinancialPulseSnapshot('household-1', 'user-1'), { wrapper })
    await waitFor(() => expect(result.current.hasData).toBe(true))

    expect(result.current.previousSnapshot).toBeNull()
  })

  it('never queries when householdId is missing', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { unmount } = await renderHook(() => useFinancialPulseSnapshot(null, 'user-1'), { wrapper })
    expect(supabase.from).not.toHaveBeenCalled()
    await unmount()
  })

  it('never queries when userId is missing', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { unmount } = await renderHook(() => useFinancialPulseSnapshot('household-1', undefined), { wrapper })
    expect(supabase.from).not.toHaveBeenCalled()
    await unmount()
  })

  it('surfaces a read failure via error, and hasData stays false — never a fabricated comparison from a failed read', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('network error') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useFinancialPulseSnapshot('household-1', 'user-1'), { wrapper })
    await waitFor(() => expect(result.current.error).toBeTruthy())

    expect(result.current.hasData).toBe(false)
    expect(result.current.previousSnapshot).toBeNull()
  })
})

describe('useRecordFinancialPulseSnapshot — write', () => {
  it('upserts household_id/user_id/safe_to_spend_agorot with the composite-key conflict target', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useRecordFinancialPulseSnapshot(), { wrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 138450 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(supabase.from).toHaveBeenCalledWith('financial_pulse_snapshots')
    expect(builder.upsert).toHaveBeenCalledWith(
      { household_id: 'household-1', user_id: 'user-1', safe_to_spend_agorot: 138450 },
      { onConflict: 'household_id,user_id' }
    )
  })

  it('surfaces a write failure via the mutation error state, without throwing', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('insufficient_privilege') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useRecordFinancialPulseSnapshot(), { wrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 138450 })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeTruthy()
  })
})
