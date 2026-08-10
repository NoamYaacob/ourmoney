// Integer-safe money operations — see ARCHITECTURE.md's library structure
// note ("lib/money/ — ILS formatting, agorot arithmetic"). Every function
// here is a pure function of integers; nothing imports lib/money/format.ts
// and nothing here ever produces or consumes a float. See CLAUDE.md § Money.

export function sumAgorot(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0)
}

// transactions.amount_agorot is negative for expenses (DATABASE_SCHEMA.md
// header note). "Spent" for a category is the positive total of its
// expenses — this sign flip is the specific "easy and very visible bug"
// PROJECT_SPEC.md calls out by name, so it is a dedicated, named,
// separately-tested step rather than incidental coverage.
export function spentAgorotFromExpenses(expenseAmounts: readonly number[]): number {
  // `-sumAgorot([])` is `-0` in JS (unary negation of 0) — normalized back
  // to a plain 0 so formatILS never renders a spurious "-₪0.00" for a
  // category with no spend at all (a real, visible bug this fixes, not
  // just a test nicety).
  return -sumAgorot(expenseAmounts) || 0
}

export function remainingAgorot(allocatedAgorot: number, spentAgorot: number): number {
  return allocatedAgorot - spentAgorot
}

// Integer division via Math.floor — never (spent / allocated) * 100 as a
// float ratio. Returns null when there is no allocation to divide by
// (zero or missing budget), so callers render an explicit "no budget" state
// instead of a misleading 0%/Infinity.
export function spentPercent(spentAgorot: number, allocatedAgorot: number): number | null {
  if (allocatedAgorot <= 0) return null
  return Math.floor((spentAgorot * 100) / allocatedAgorot)
}

// Integer cross-multiplication, never a float ratio: "has spending reached
// thresholdPercent of the allocation" is spentAgorot * 100 >= allocatedAgorot
// * thresholdPercent, not (spentAgorot / allocatedAgorot) >= thresholdPercent
// / 100. This is the pattern that keeps threshold logic — which directly
// drives a real notification — free of float-rounding surprises.
export function hasReachedThresholdPercent(
  spentAgorot: number,
  allocatedAgorot: number,
  thresholdPercent: number
): boolean {
  if (allocatedAgorot <= 0) return false
  return spentAgorot * 100 >= allocatedAgorot * thresholdPercent
}
