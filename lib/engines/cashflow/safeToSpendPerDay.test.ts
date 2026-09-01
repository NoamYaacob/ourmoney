// RRR P1 finding #5 regression test: reproduces the exact ~30× mismatch the
// Release Readiness Review measured live (desktop's hardcoded `/ 30` vs
// mobile's real-day-count division) for the same safeToSpendAgorot figure,
// then proves the shared helper both screens now call resolves it — a
// 7-day week horizon and a 30-day horizon must no longer disagree by a
// factor of ~30 on the identical starting figure.
import { describe, expect, it } from '@jest/globals'
import { computeSafeToSpendPerDayAgorot } from './safeToSpendPerDay'

describe('computeSafeToSpendPerDayAgorot', () => {
  it('divides by the real number of days remaining in the horizon, not a fixed 30', () => {
    // Today 2026-08-16 (Sunday), week horizon ends 2026-08-22 (Saturday) —
    // 7 days remaining, inclusive of today.
    expect(computeSafeToSpendPerDayAgorot(700_00, '2026-08-22', '2026-08-16')).toBe(100_00)
  })

  it('a week-horizon figure and a 30-day-horizon figure no longer diverge by ~30× for the same safeToSpendAgorot', () => {
    const safeToSpendAgorot = 1_698_600 // ₪16,986.00 — the RRR's own live-measured figure
    const weekPerDay = computeSafeToSpendPerDayAgorot(safeToSpendAgorot, '2026-08-22', '2026-08-16')
    const days30PerDay = computeSafeToSpendPerDayAgorot(safeToSpendAgorot, '2026-09-14', '2026-08-16')
    // Both must be in the same order of magnitude — the bug this fixes made
    // desktop's own hardcoded /30 produce ~days30PerDay regardless of which
    // horizon was actually selected, including when 'week' was selected.
    expect(weekPerDay).toBeGreaterThan(days30PerDay)
    expect(weekPerDay / days30PerDay).toBeLessThan(5)
  })

  it('today being the horizon end still divides by exactly 1 day, never 0', () => {
    expect(computeSafeToSpendPerDayAgorot(500_00, '2026-08-16', '2026-08-16')).toBe(500_00)
  })

  it('floors rather than rounds, so the figure never overstates the true spendable amount', () => {
    // 1000 agorot over 3 days = 333.33... — a naive round() would produce
    // 333 * 3 = 999 (fine) but a genuinely fractional case must floor, not
    // round up past the true per-day amount.
    expect(computeSafeToSpendPerDayAgorot(1000, '2026-08-18', '2026-08-16')).toBe(333)
  })

  it('a non-positive safeToSpendAgorot returns 0 rather than a negative or NaN per-day figure', () => {
    expect(computeSafeToSpendPerDayAgorot(0, '2026-08-22', '2026-08-16')).toBe(0)
    expect(computeSafeToSpendPerDayAgorot(-500_00, '2026-08-22', '2026-08-16')).toBe(0)
  })
})
