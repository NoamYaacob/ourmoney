// Reuses categoryBreakdown.ts's output rather than re-aggregating raw
// transactions — one aggregation implementation, two consumers (the donut
// chart and this ranked list).
import type { CategoryBreakdownEntry } from './categoryBreakdown'

export function computeTopCategories(
  breakdown: readonly CategoryBreakdownEntry[],
  limit: number
): CategoryBreakdownEntry[] {
  return [...breakdown].sort((a, b) => b.spentAgorot - a.spentAgorot).slice(0, limit)
}
