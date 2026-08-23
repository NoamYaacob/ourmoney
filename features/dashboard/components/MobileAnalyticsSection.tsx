// The analytics the mobile design does not put on Home, kept reachable on a
// phone without putting them back in the way.
//
// The design's Home is four blocks, and its "עוד" screen has no analytics
// row — read literally, that would strand the six-month trend, the category
// donut and the top-categories list on desktop only. Rather than invent a
// screen the design never specified, they live behind a closed disclosure
// at the bottom of Home.
//
// This component is mounted only while the disclosure is open, which is
// what makes that free: the six-month transaction window it needs is a
// genuinely wide query, and a household that never opens the section never
// pays for it. Every figure comes from the same pure helpers the desktop
// dashboard uses — no second aggregation lives here.

import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { shiftMonth } from '@/features/budgets/lib/budgetPeriod'
import { computeMonthlyTrend } from '@/features/analytics/lib/monthlyTrend'
import { computeCategoryBreakdown } from '@/features/analytics/lib/categoryBreakdown'
import { computeTopCategories } from '@/features/analytics/lib/topCategories'
import { MonthlyTrendChart } from '@/features/analytics/components/MonthlyTrendChart'
import { CategoryDonutChart } from '@/features/analytics/components/CategoryDonutChart'
import { TopCategoriesList } from '@/features/analytics/components/TopCategoriesList'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

const TREND_MONTHS = 6

export function MobileAnalyticsSection({
  householdId,
  periodStart,
}: {
  householdId: string | null | undefined
  periodStart: string
}) {
  const { t } = useTranslation()
  const monthStarts = Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonth(periodStart, -(TREND_MONTHS - 1 - i)))
  const {
    transactions,
    isLoading,
    error,
  } = useTransactions(householdId, { periodStart: monthStarts[0] as string, periodEnd: periodStart })
  const { categories } = useCategories(householdId)

  if (error) return <ErrorMessage message={t('dashboard.errors.generic')} />
  if (isLoading) return <SkeletonList rows={3} />

  const input = transactions.map((transaction) => ({
    categoryId: transaction.category_id,
    amountAgorot: transaction.amount_agorot,
    txnDate: transaction.txn_date,
    isShared: transaction.is_shared,
    isExcluded: transaction.is_excluded,
    transferId: transaction.transfer_id,
  }))
  const trendPoints = computeMonthlyTrend(input, monthStarts)
  const breakdown = computeCategoryBreakdown(input, periodStart)
  const topCategories = computeTopCategories(breakdown, 5)
  const categoryNameById = Object.fromEntries(categories.map((category) => [category.id, category.name_he]))
  const categoryIconById = Object.fromEntries(categories.map((category) => [category.id, category.icon]))

  const trendIsEmpty = trendPoints.every((point) => point.incomeAgorot === 0 && point.expenseAgorot === 0)

  // One combined message rather than three stacked "not enough data" blocks
  // — the same collapse the desktop dashboard already makes for a household
  // with no history yet.
  if (trendIsEmpty && breakdown.length === 0) {
    return (
      <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.analytics.empty')}
      </Text>
    )
  }

  return (
    <View className="gap-5">
      {!trendIsEmpty && (
        <View>
          <SectionLabel className="mb-2">{t('dashboard.analytics.trendTitle')}</SectionLabel>
          <MonthlyTrendChart points={trendPoints} />
        </View>
      )}

      {breakdown.length > 0 && (
        <View>
          <SectionLabel className="mb-2">{t('dashboard.analytics.breakdownTitle')}</SectionLabel>
          <View className="items-center">
            <CategoryDonutChart breakdown={breakdown} categoryNameById={categoryNameById} />
          </View>
        </View>
      )}

      {topCategories.length > 0 && (
        <View>
          <SectionLabel className="mb-2">{t('dashboard.analytics.topCategoriesTitle')}</SectionLabel>
          <TopCategoriesList
            entries={topCategories}
            categoryNameById={categoryNameById}
            categoryIconById={categoryIconById}
          />
        </View>
      )}
    </View>
  )
}
