// Lifecycle tests for the ONE piece of imperative behavior this hook owns:
// recording a new snapshot exactly once per resolved mount, never before
// Safe-to-Spend has genuinely resolved, never repeatedly on re-render. All
// dependency hooks are mocked at their own module boundary — the same
// "mock at the hook boundary" convention MobileHome.test.tsx/
// DesktopDashboard.test.tsx already use for this exact hook, and what
// computeFinancialPulse.test.ts/useFinancialPulseSnapshot.test.tsx already
// cover for the pure derivation and the raw data layer respectively. This
// file is the only place the LIFECYCLE itself (the ref-guard, the mount/
// unmount/remount behavior) is exercised.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { captureException } from '@/lib/monitoring/crashReporting'
import { useFinancialPulse } from './useFinancialPulse'

const mockMutate = jest.fn<
  (input: { householdId: string; userId: string; safeToSpendAgorot: number }, options: { onError: (error: Error) => void }) => void
>()
jest.mock('./useFinancialPulseSnapshot', () => ({
  useFinancialPulseSnapshot: () => mockUseFinancialPulseSnapshot(),
  useRecordFinancialPulseSnapshot: () => ({ mutate: mockMutate }),
}))
const mockUseFinancialPulseSnapshot = jest.fn()

jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: [] }),
}))
jest.mock('@/features/recurring/hooks/usePriceIncreaseDetections', () => ({
  usePriceIncreaseDetections: () => ({ detections: [] }),
}))
jest.mock('@/lib/monitoring/crashReporting', () => ({
  captureException: jest.fn(),
}))

beforeEach(() => {
  jest.resetAllMocks()
  // resetAllMocks strips mockMutate's implementation too (deliberately —
  // the captureException test below sets a one-off custom implementation
  // that must never leak into a later test), so every default behavior is
  // re-established here, fresh, every test.
  mockUseFinancialPulseSnapshot.mockReturnValue({
    previousSnapshot: { safeToSpendAgorot: 200450, capturedAt: '2026-08-10T00:00:00Z' },
    hasData: true,
  })
})

describe('useFinancialPulse — recording lifecycle', () => {
  it('does not record before Safe-to-Spend has resolved', async () => {
    const { unmount } = await renderHook(() => useFinancialPulse('household-1', 'user-1', { hasData: false, safeToSpendAgorot: 0 }))
    expect(mockMutate).not.toHaveBeenCalled()
    await unmount()
  })

  it('never persists a fake zero — hasData:false is never treated as "record 0"', async () => {
    const { unmount } = await renderHook(() => useFinancialPulse('household-1', 'user-1', { hasData: false, safeToSpendAgorot: 0 }))
    expect(mockMutate).not.toHaveBeenCalled()
    await unmount()
  })

  it('records once, with the correct household/user keying and the real current figure, once Safe-to-Spend resolves', async () => {
    const { unmount } = await renderHook(() => useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(mockMutate).toHaveBeenCalledWith(
      { householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 138450 },
      expect.objectContaining({ onError: expect.any(Function) })
    )
    await unmount()
  })

  it('does not record when householdId is missing', async () => {
    const { unmount } = await renderHook(() => useFinancialPulse(null, 'user-1', { hasData: true, safeToSpendAgorot: 138450 }))
    expect(mockMutate).not.toHaveBeenCalled()
    await unmount()
  })

  it('does not record when userId is missing', async () => {
    const { unmount } = await renderHook(() =>
      useFinancialPulse('household-1', undefined, { hasData: true, safeToSpendAgorot: 138450 })
    )
    expect(mockMutate).not.toHaveBeenCalled()
    await unmount()
  })

  it('does not record again on a re-render with the same resolved data — idempotent, not repeated on every render', async () => {
    const { unmount, rerender } = await renderHook(
      ({ agorot }: { agorot: number }) => useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: agorot }),
      { initialProps: { agorot: 138450 } }
    )
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))

    // A re-render where the CURRENT figure changes mid-mount (e.g. a
    // background refetch after the user adds a transaction) must NOT
    // trigger a second write — the guard fires once per mount, on the
    // first resolved reading, by design (see useFinancialPulse.ts's own
    // header comment on why).
    await rerender({ agorot: 999999 })
    expect(mockMutate).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('records again on a genuinely new mount (unmount + remount) — each real visit gets its own recording attempt', async () => {
    const { unmount: unmountFirst } = await renderHook(() =>
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 })
    )
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    await unmountFirst()

    const { unmount: unmountSecond } = await renderHook(() =>
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 })
    )
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2))
    await unmountSecond()
  })

  it('still records the snapshot even when the delta is below the materiality threshold and Pulse is visually omitted (CP8E correction)', async () => {
    mockUseFinancialPulseSnapshot.mockReturnValue({
      previousSnapshot: { safeToSpendAgorot: 500000, capturedAt: '2026-08-10T00:00:00Z' },
      hasData: true,
    })
    const { result, unmount } = await renderHook(() =>
      // 499 agorot below the ₪5.00 materiality threshold — Pulse must be
      // omitted from render, but the write is unconditional on hasData.
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 499501 })
    )

    expect(result.current.pulse).toBeNull()
    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(mockMutate).toHaveBeenCalledWith(
      { householdId: 'household-1', userId: 'user-1', safeToSpendAgorot: 499501 },
      expect.objectContaining({ onError: expect.any(Function) })
    )
    await unmount()
  })

  it('logs a failed write via captureException without throwing, and never breaks the render', async () => {
    mockMutate.mockImplementation((_input, options) => {
      options.onError(new Error('insufficient_privilege'))
    })

    const { result, unmount } = await renderHook(() =>
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 })
    )

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ context: 'financial_pulse_snapshot_write', householdId: 'household-1' })
      )
    )
    // The hook itself never throws or surfaces the error as a render crash.
    expect(result.current.pulse).not.toBeUndefined()
    await unmount()
  })
})

describe('useFinancialPulse — rendered pulse', () => {
  it('is null until both Safe-to-Spend and the previous snapshot read have resolved', async () => {
    mockUseFinancialPulseSnapshot.mockReturnValue({ previousSnapshot: null, hasData: false })
    const { result, unmount } = await renderHook(() =>
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 })
    )
    expect(result.current.pulse).toBeNull()
    await unmount()
  })

  it('is null on first visit (snapshot read resolved, but no previous row)', async () => {
    mockUseFinancialPulseSnapshot.mockReturnValue({ previousSnapshot: null, hasData: true })
    const { result, unmount } = await renderHook(() =>
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 })
    )
    expect(result.current.pulse).toBeNull()
    await unmount()
  })

  it('reflects a real delta once both sources have resolved', async () => {
    mockUseFinancialPulseSnapshot.mockReturnValue({
      previousSnapshot: { safeToSpendAgorot: 200450, capturedAt: '2026-08-10T00:00:00Z' },
      hasData: true,
    })
    const { result, unmount } = await renderHook(() =>
      useFinancialPulse('household-1', 'user-1', { hasData: true, safeToSpendAgorot: 138450 })
    )
    expect(result.current.pulse?.safeToSpendDeltaAgorot).toBe(-62000)
    await unmount()
  })
})
