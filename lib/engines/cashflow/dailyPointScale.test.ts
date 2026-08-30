import { describe, expect, it } from '@jest/globals'
import { buildDailyPointScale } from './dailyPointScale'

function points(dates: string[]) {
  return dates.map((date) => ({ date }))
}

describe('buildDailyPointScale', () => {
  it('is genuinely date-proportional: a 1-day gap and a 10-day gap occupy proportional distance', () => {
    // 12 contiguous days (index == days-since-start, exactly what
    // calculateCashFlowForecast.ts's own daily walk guarantees).
    const dates = Array.from({ length: 12 }, (_, i) => `2026-08-${String(1 + i).padStart(2, '0')}`)
    const scale = buildDailyPointScale(points(dates), 1100)

    const xDay0 = scale.xForDate('2026-08-01')! // today
    const xDay1 = scale.xForDate('2026-08-02')! // 1-day gap from day 0
    const xDay11 = scale.xForDate('2026-08-12')! // 10-day gap from day 1

    const oneDayGap = Math.abs(xDay0 - xDay1)
    const tenDayGap = Math.abs(xDay1 - xDay11)

    // The 10-day gap must be ~10x the 1-day gap, not visually equal to it —
    // the exact defect this scale exists to prevent.
    expect(tenDayGap / oneDayGap).toBeCloseTo(10, 5)
  })

  it('places today (index 0) at the right edge and the horizon end at the left edge — the RTL mirror', () => {
    const dates = Array.from({ length: 30 }, (_, i) => `2026-08-${String(1 + i).padStart(2, '0')}`)
    const scale = buildDailyPointScale(points(dates), 900)

    expect(scale.xForIndex(0)).toBe(900)
    expect(scale.xForIndex(29)).toBe(0)
  })

  it('returns null for a date outside the scale’s own horizon, never an invented pixel', () => {
    const scale = buildDailyPointScale(points(['2026-08-16', '2026-08-17', '2026-08-18']), 300)
    expect(scale.xForDate('2026-09-01')).toBeNull()
  })

  it('does not divide by zero for a single-day series', () => {
    const scale = buildDailyPointScale(points(['2026-08-16']), 300)
    expect(scale.xForIndex(0)).toBe(300)
    expect(Number.isFinite(scale.xForIndex(0))).toBe(true)
  })

  it('is a pure function: the same input always produces the same output', () => {
    const dates = ['2026-08-16', '2026-08-20', '2026-08-25']
    const a = buildDailyPointScale(points(dates), 500)
    const b = buildDailyPointScale(points(dates), 500)
    expect(a.xForDate('2026-08-20')).toBe(b.xForDate('2026-08-20'))
    expect(a.xForIndex(1)).toBe(b.xForIndex(1))
  })
})
