// The date⇄pixel mapping every chart drawn over `CashFlowDailyPoint[]`
// needs, extracted from ForecastChart.tsx rather than re-derived (CP8B
// audit finding: ForecastChart already has genuinely date-proportional
// geometry, and it needs to be reused, not reinvented).
//
// Why indexing over `dailyPoints` is already date-proportional, with no
// separate day-diff math required: calculateCashFlowForecast.ts's own
// day-by-day walk (`cursor = addDays(cursor, 1)`) guarantees one entry per
// *calendar* day, contiguous, start to end, with no gaps — so a point's
// array index already equals "days since the horizon's start." Spacing
// pixels evenly across that index range is therefore identical to spacing
// them evenly across real elapsed days: a 1-day gap between two dates and a
// 10-day gap between two other dates occupy proportionally 1x and 10x the
// horizontal distance, automatically, with zero date arithmetic beyond the
// lookup below.
//
// This is exactly the primitive ForecastChart.tsx's own `stepX`/`xForIndex`
// used to compute inline; extracting it here and having ForecastChart call
// it is the "reuse, don't reinvent" the CP8B brief asks for, verified by
// ForecastChart.test.tsx staying fully green after the swap (see that
// file's own git history / the CP8B review for the before/after proof).

import type { CashFlowDailyPoint } from './calculateCashFlowForecast'

export interface DailyPointScale {
  // Pixel x for a raw index into the same `dailyPoints` array this scale
  // was built from. Time runs right to left in this RTL app — index 0
  // (today) maps to the width's own right edge (`width`), and the x value
  // decreases as the index grows, exactly matching every existing chart's
  // "physical mirror" convention (SVG has no `dir`, so the mirror has to be
  // arithmetic — see ForecastChart.tsx's own header comment).
  xForIndex(index: number): number
  // Pixel x for a real calendar date, looked up against this scale's own
  // `dailyPoints`. Returns null for a date outside the horizon this scale
  // was built from (never invented, never clamped to an edge) — a caller
  // that gets null has a real "this event doesn't fall in the plotted
  // range" case to handle, not a wrong pixel to silently draw.
  xForDate(date: string): number | null
}

export function buildDailyPointScale(dailyPoints: readonly Pick<CashFlowDailyPoint, 'date'>[], width: number): DailyPointScale {
  const stepX = width / Math.max(1, dailyPoints.length - 1)
  const indexByDate = new Map(dailyPoints.map((point, index) => [point.date, index]))

  return {
    xForIndex: (index) => width - index * stepX,
    xForDate: (date) => {
      const index = indexByDate.get(date)
      return index === undefined ? null : width - index * stepX
    },
  }
}
