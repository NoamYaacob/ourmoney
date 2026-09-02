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
  it('upserts household_id/user_id/safe_to_spend_agorot/captured_at with the composite-key conflict target', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useRecordFinancialPulseSnapshot(), { wrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 138450 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(supabase.from).toHaveBeenCalledWith('financial_pulse_snapshots')
    expect(builder.upsert).toHaveBeenCalledWith(
      {
        household_id: 'household-1',
        user_id: 'user-1',
        safe_to_spend_agorot: 138450,
        captured_at: expect.any(String),
      },
      { onConflict: 'household_id,user_id' }
    )
  })

  // RRR P1 finding #3 regression coverage: captured_at has a DB-side
  // `DEFAULT NOW()` (migration 017), but that default only ever fires on
  // INSERT — an upsert's ON CONFLICT DO UPDATE branch only sets the columns
  // actually present in the payload. Omitting captured_at from the payload
  // (the pre-fix bug) meant every write after the household's first-ever
  // snapshot silently left captured_at exactly as it was on that first
  // write, forever — "since last time" then means "since our very first
  // session," not "since the previous visit," growing more wrong with every
  // subsequent write. The payload must explicitly set a fresh captured_at
  // on every call so a SECOND write for the same (household_id, user_id)
  // genuinely advances it.
  it('sends a fresh captured_at on every write, so a second snapshot for the same household/user genuinely advances the boundary', async () => {
    const realDateToISOString = Date.prototype.toISOString
    const isoValues = ['2026-08-10T09:00:00.000Z', '2026-08-17T09:00:00.000Z']
    let call = 0
    // Deterministic without fake timers (which leave TanStack Query's
    // retry/gc timers open and make Jest hang on exit) — only
    // toISOString()'s return value is stubbed, call by call, so the
    // mutationFn's own `new Date().toISOString()` is what's actually
    // exercised on each write.
    jest.spyOn(Date.prototype, 'toISOString').mockImplementation(function (this: Date) {
      return isoValues[call++] ?? realDateToISOString.call(this)
    })

    const builderFirst = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builderFirst as unknown as ReturnType<typeof supabase.from>)

    const { result: firstWrite } = await renderHook(() => useRecordFinancialPulseSnapshot(), { wrapper })
    firstWrite.current.mutate({ householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 100000 })
    await waitFor(() => expect(firstWrite.current.isSuccess).toBe(true))
    const firstCapturedAt = (builderFirst.upsert.mock.calls[0]?.[0] as { captured_at: string }).captured_at
    expect(firstCapturedAt).toBe('2026-08-10T09:00:00.000Z')

    const builderSecond = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builderSecond as unknown as ReturnType<typeof supabase.from>)

    const { result: secondWrite } = await renderHook(() => useRecordFinancialPulseSnapshot(), { wrapper })
    secondWrite.current.mutate({ householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 90000 })
    await waitFor(() => expect(secondWrite.current.isSuccess).toBe(true))
    const secondCapturedAt = (builderSecond.upsert.mock.calls[0]?.[0] as { captured_at: string }).captured_at

    // The specific freeze this test guards against: a second write for the
    // same household/user must NOT resend the first write's captured_at.
    expect(secondCapturedAt).not.toBe(firstCapturedAt)
    expect(secondCapturedAt).toBe('2026-08-17T09:00:00.000Z')

    jest.spyOn(Date.prototype, 'toISOString').mockRestore()
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
