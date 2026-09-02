// Which upcoming event drives the balance to its low point.
//
// The mobile cash-flow screen's whole argument is that a dip in a line is
// not actionable but "the car licence on the 4th is what does it" is. That
// claim has to be derived, not decorated, so it lives here as a pure
// function with its own tests rather than inline in the screen.
//
// Deliberately a SELECTION over the forecast engine's own chronological
// `events`, never a second forecast: the last money-out event dated on or
// before the low point is, by construction of the running balance, the one
// that took it there. Nothing here re-adds amounts or re-derives dates.
//
// Returns undefined rather than a best guess when no outflow precedes the
// low point — a horizon whose balance simply drifts down from day one with
// no event inside it has no single culprit, and labelling an arbitrary row
// as "the cause" would be a claim the data does not support.

import type { CashFlowForecastEvent } from '@/lib/engines/cashflow/calculateCashFlowForecast'

export function causeOfLowPoint(
  events: readonly CashFlowForecastEvent[],
  lowestBalanceDate: string
): CashFlowForecastEvent | undefined {
  let cause: CashFlowForecastEvent | undefined

  for (const event of events) {
    if (event.direction !== 'outflow') continue
    if (event.date > lowestBalanceDate) continue
    // `events` is chronological (the engine's own guarantee), so the last
    // qualifying one wins. Compared on date rather than trusting order
    // alone so a future change to the engine's tie-break can't silently
    // pick an earlier event.
    if (!cause || event.date >= cause.date) cause = event
  }

  return cause
}
