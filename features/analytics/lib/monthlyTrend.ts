import { spentAgorotFromExpenses, sumAgorot } from '@/lib/money/arithmetic'
import { getPeriodEnd } from '@/features/budgets/lib/budgetPeriod'
import { filterForAnalytics, type AnalyticsTransaction } from './analyticsTransaction'

export interface MonthlyTrendPoint {
  periodStart: string
  incomeAgorot: number
  expenseAgorot: number
}

export function computeMonthlyTrend(
  transactions: readonly AnalyticsTransaction[],
  periodStarts: readonly string[]
): MonthlyTrendPoint[] {
  return periodStarts.map((periodStart) => {
    const inPeriod = filterForAnalytics(transactions, periodStart, getPeriodEnd(periodStart))
    const incomeAgorot = sumAgorot(inPeriod.filter((t) => t.amountAgorot > 0).map((t) => t.amountAgorot))
    const expenseAgorot = spentAgorotFromExpenses(inPeriod.filter((t) => t.amountAgorot < 0).map((t) => t.amountAgorot))
    return { periodStart, incomeAgorot, expenseAgorot }
  })
}
