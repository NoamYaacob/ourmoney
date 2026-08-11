import { spentAgorotFromExpenses } from '@/lib/money/arithmetic'
import { getPeriodEnd } from '@/features/budgets/lib/budgetPeriod'
import { filterForAnalytics, type AnalyticsTransaction } from './analyticsTransaction'

export interface CategoryBreakdownEntry {
  categoryId: string
  spentAgorot: number
}

export function computeCategoryBreakdown(
  transactions: readonly AnalyticsTransaction[],
  periodStart: string
): CategoryBreakdownEntry[] {
  const inPeriod = filterForAnalytics(transactions, periodStart, getPeriodEnd(periodStart)).filter(
    (t) => t.categoryId !== null && t.amountAgorot < 0
  )

  const byCategory = new Map<string, number[]>()
  for (const t of inPeriod) {
    const list = byCategory.get(t.categoryId as string) ?? []
    list.push(t.amountAgorot)
    byCategory.set(t.categoryId as string, list)
  }

  return Array.from(byCategory.entries()).map(([categoryId, amounts]) => ({
    categoryId,
    spentAgorot: spentAgorotFromExpenses(amounts),
  }))
}
