// The "calm negative state" axis rule, extracted from ForecastChart.tsx
// rather than re-derived — CP8B (Money Journey) needs the identical
// negative/near-zero handling ForecastChart already solved, not a second,
// possibly-diverging definition of "calm."
//
// The rule (verbatim from ForecastChart.tsx's own original comment): always
// forcing 0 into the visible domain is exactly right for a household
// anywhere near a real shortfall, but produces an almost-flat line for a
// comfortably-positive one — real day-to-day movement (thousands of
// shekels) reads as a rounding error against a domain stretching down to a
// zero that was never remotely in reach. Only compress away from zero when
// the balance stays comfortably clear of it (never dips within its own
// range's width of zero) — every household whose balance could plausibly
// be read as "close to zero" still gets the exact original, safety-first
// zero-anchored axis. Never changes a single plotted balance, only the axis
// it's drawn against.

export interface BalanceAxisRange {
  minBalance: number
  maxBalance: number
  range: number
  // Whether the caller should draw a zero reference line/label at all —
  // false exactly when the axis compressed away from zero because the
  // balance never came close to it.
  showZeroReference: boolean
}

export function computeBalanceAxisRange(balances: readonly number[]): BalanceAxisRange {
  const rawMin = Math.min(...balances)
  const rawMax = Math.max(...balances)
  const rawRange = rawMax - rawMin || 1

  const staysComfortablyPositive = rawMin > rawRange
  const minBalance = staysComfortablyPositive ? rawMin - rawRange * 0.15 : Math.min(0, ...balances)
  const maxBalance = staysComfortablyPositive ? rawMax + rawRange * 0.15 : Math.max(0, ...balances)
  const range = maxBalance - minBalance || 1

  return { minBalance, maxBalance, range, showZeroReference: !staysComfortablyPositive }
}
