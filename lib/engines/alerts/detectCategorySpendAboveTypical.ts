// Deterministic "category spending materially above typical level"
// detection — mirrors features/recurring/lib/priceIncreaseDetection.ts's
// own shape exactly (dual absolute-AND-percent threshold, integer-safe
// median, "a single prior observation is itself a valid baseline"), applied
// to a different axis: per-category spend PER MONTH instead of per-bill
// amount per occurrence.
//
// Deliberately no extrapolation of the in-progress current month: the
// comparison is the household's spend-so-far this month against the median
// of recent COMPLETE months for that same category — a plain, honest fact
// ("already spent more than a typical whole month, this early"), never a
// projected end-of-month figure (that projection already exists,
// separately and explicitly labeled, in
// lib/engines/budgets/calculateBudgetPace.ts).
//
// A historical month with no spend in a category is a real, meaningful data
// point (the household genuinely didn't spend there that month) and
// contributes 0 to that category's baseline — never silently dropped from
// the window, so "typical" reflects genuine irregularity rather than only
// averaging over months where spend happened to occur.

export interface CategorySpendThreshold {
  minAbsoluteAgorot: number
  minPercent: number
}

// Conservative default — no existing repo convention for "what counts as a
// meaningful category overspend" (same search discipline
// priceIncreaseDetection.ts's own threshold comment documents). A pure,
// exported constant so it can be tuned later without touching the detector.
export const DEFAULT_CATEGORY_SPEND_THRESHOLD: CategorySpendThreshold = {
  minAbsoluteAgorot: 20_000, // ₪200.00
  minPercent: 30,
}

export interface CategoryMonthObservation {
  categoryId: string
  categoryNameHe: string
  spentAgorot: number
}

export interface CategorySpendAboveTypicalDetection {
  categoryId: string
  categoryNameHe: string
  currentSpentAgorot: number
  typicalAgorot: number
  excessAgorot: number
  excessPercent: number
}

// Integer-safe median — identical rule to priceIncreaseDetection.ts's own
// medianAgorot: even-length inputs floor the average of the two middle
// values, since a baseline amount is compared against and reported as
// money and must stay an exact integer (CLAUDE.md § Money).
function medianAgorot(sortedAmounts: readonly number[]): number {
  const n = sortedAmounts.length
  const mid = Math.floor(n / 2)
  if (n % 2 === 1) return sortedAmounts[mid]!
  return Math.floor((sortedAmounts[mid - 1]! + sortedAmounts[mid]!) / 2)
}

// Deterministic, pure — same input always produces the same output.
// `currentMonth` is expected to be one household's current (in-progress)
// month's per-category breakdown (e.g. computeCategoryBreakdown's output);
// `historicalMonths` one entry per recent COMPLETE month, each itself a
// per-category breakdown for that month (categories absent from a given
// month's array are treated as 0 spend that month, per this file's own
// header comment).
export function detectCategorySpendAboveTypical(
  currentMonth: readonly CategoryMonthObservation[],
  historicalMonths: readonly (readonly CategoryMonthObservation[])[],
  threshold: CategorySpendThreshold = DEFAULT_CATEGORY_SPEND_THRESHOLD
): CategorySpendAboveTypicalDetection[] {
  // No historical window at all — nothing to compare against yet (a brand
  // new household). Never invent a baseline.
  if (historicalMonths.length === 0) return []

  const detections: CategorySpendAboveTypicalDetection[] = []

  for (const current of currentMonth) {
    const historicalAmounts = historicalMonths
      .map((month) => month.find((entry) => entry.categoryId === current.categoryId)?.spentAgorot ?? 0)
      .sort((a, b) => a - b)

    const typicalAgorot = historicalAmounts.length === 1 ? historicalAmounts[0]! : medianAgorot(historicalAmounts)

    const excessAgorot = current.spentAgorot - typicalAgorot
    if (excessAgorot <= 0) continue // at or below typical — never an "above typical" alert

    const meetsAbsolute = excessAgorot >= threshold.minAbsoluteAgorot
    // Integer cross-multiplication, matching priceIncreaseDetection.ts's
    // meetsPercent — never a float ratio for the pass/fail decision itself.
    // A zero baseline (every historical month had no spend in this
    // category) can never pass the percent bar, same guard as
    // priceIncreaseDetection.ts's own meetsPercent.
    const meetsPercent = typicalAgorot > 0 && excessAgorot * 100 >= typicalAgorot * threshold.minPercent
    if (!meetsAbsolute || !meetsPercent) continue

    const excessPercent = typicalAgorot > 0 ? Math.round((excessAgorot / typicalAgorot) * 1000) / 10 : 0

    detections.push({
      categoryId: current.categoryId,
      categoryNameHe: current.categoryNameHe,
      currentSpentAgorot: current.spentAgorot,
      typicalAgorot,
      excessAgorot,
      excessPercent,
    })
  }

  return detections.sort((a, b) => b.excessAgorot - a.excessAgorot || a.categoryId.localeCompare(b.categoryId))
}
