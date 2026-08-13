import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { usePeriodStore } from '@/store/periodStore'
import { shiftMonth } from '@/features/budgets/lib/budgetPeriod'
import { remainingAgorot } from '@/lib/money/arithmetic'
import { formatILS } from '@/lib/money/format'
import { computeMonthlyTrend } from '@/features/analytics/lib/monthlyTrend'
import { computeCategoryBreakdown } from '@/features/analytics/lib/categoryBreakdown'
import { computeTopCategories } from '@/features/analytics/lib/topCategories'
import { MonthlyTrendChart } from '@/features/analytics/components/MonthlyTrendChart'
import { CategoryDonutChart } from '@/features/analytics/components/CategoryDonutChart'
import { TopCategoriesList } from '@/features/analytics/components/TopCategoriesList'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { HIT_SLOP } from '@/constants/accessibility'

// Real MVP-2 dashboard, replacing the M1 placeholder. Every figure here is
// either a direct query result or derived via lib/money — never a bare `0`
// on a pending/failed query (fail-safe display principle, M6 plan §6).
export default function Dashboard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const setPeriodStart = usePeriodStore((s) => s.setSelectedPeriodStart)
  const {
    categories: progress,
    totalAllocatedAgorot,
    totalSpentAgorot,
    isLoading: isProgressLoading,
    error: progressError,
  } = useBudgetProgress(householdId, periodStart)
  const { transactions, isLoading: isTransactionsLoading, error: transactionsError } = useTransactions(householdId, {
    periodStart,
  })

  const recentTransactions = transactions.slice(0, 5)

  // Analytics — lives inside Dashboard, not a separate route (no route is
  // reserved for it anywhere in the app tree). A widened 6-month window,
  // reusing useTransactions' existing filters shape (no new query-key
  // prefix — ['transactions', householdId] already covers it, so no change
  // to lib/cache/clearHouseholdScopedQueries.ts was needed for this).
  const last6MonthStarts = Array.from({ length: 6 }, (_, i) => shiftMonth(periodStart, -(5 - i)))
  const analyticsWindowStart = last6MonthStarts[0] as string
  const {
    transactions: analyticsTransactions,
    isLoading: isAnalyticsLoading,
    error: analyticsError,
  } = useTransactions(householdId, {
    periodStart: analyticsWindowStart,
    periodEnd: periodStart,
  })
  const { categories: allCategories } = useCategories(householdId)
  const categoryNameById = Object.fromEntries(allCategories.map((c) => [c.id, c.name_he]))
  const categoryIconById = Object.fromEntries(allCategories.map((c) => [c.id, c.icon]))

  const analyticsInput = analyticsTransactions.map((t) => ({
    categoryId: t.category_id,
    amountAgorot: t.amount_agorot,
    txnDate: t.txn_date,
    isShared: t.is_shared,
    isExcluded: t.is_excluded,
  }))
  const monthlyTrendPoints = computeMonthlyTrend(analyticsInput, last6MonthStarts)
  const categoryBreakdown = computeCategoryBreakdown(analyticsInput, periodStart)
  const topCategories = computeTopCategories(categoryBreakdown, 5)
  // Same "no data" convention as categoryBreakdown/topCategories below
  // (an empty derived array) — a trend made entirely of zero-value points
  // is the monthly-trend equivalent of an empty breakdown array, since
  // computeMonthlyTrend always returns one point per month regardless of
  // whether any transaction fell in it.
  const monthlyTrendIsEmpty = monthlyTrendPoints.every((p) => p.incomeAgorot === 0 && p.expenseAgorot === 0)

  // Fail-safe display: while useHousehold is still resolving (a real
  // network round trip on every cold start), householdId is null and every
  // downstream hook below is `enabled: false` — without this gate, the
  // screen would render a fully "loaded"-looking ₪0.00 summary that's
  // indistinguishable from a real zero-spend household (mobile-expo-
  // reviewer finding, confirmed systemic across every new M6 screen).
  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  return (
    <Screen>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">{t('dashboard.title')}</Text>
      </View>

      <View className="mb-4 flex-row items-center justify-between">
        <Pressable onPress={() => setPeriodStart(shiftMonth(periodStart, -1))} accessibilityRole="button" hitSlop={HIT_SLOP}>
          <Text className="text-base text-accent-light dark:text-accent-dark">{t('budgets.prevMonth')}</Text>
        </Pressable>
        <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{periodStart.slice(0, 7)}</Text>
        <Pressable onPress={() => setPeriodStart(shiftMonth(periodStart, 1))} accessibilityRole="button" hitSlop={HIT_SLOP}>
          <Text className="text-base text-accent-light dark:text-accent-dark">{t('budgets.nextMonth')}</Text>
        </Pressable>
      </View>

      {progressError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isProgressLoading ? (
        <LoadingSpinner />
      ) : (
        <Card>
          <View className="flex-row justify-between">
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.spent')}</Text>
            <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">
              {formatILS(totalSpentAgorot)}
            </Text>
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.remaining')}</Text>
            <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">
              {formatILS(remainingAgorot(totalAllocatedAgorot, totalSpentAgorot))}
            </Text>
          </View>
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.categoriesTitle')}
      </Text>
      {isProgressLoading ? (
        <SkeletonList rows={3} />
      ) : progressError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : progress.length === 0 ? (
        <EmptyState icon="🎯" message={t('dashboard.noBudget')} />
      ) : (
        <Card>
          {progress.map((category, index) => (
            <View key={category.categoryId}>
              {index > 0 && (
                <View className="my-2">
                  <Divider />
                </View>
              )}
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="text-sm text-ink-light dark:text-ink-dark">
                  {category.categoryIcon} {category.categoryNameHe}
                </Text>
                <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                  {formatILS(category.spentAgorot)} / {formatILS(category.allocatedAgorot)}
                </Text>
              </View>
              <ProgressBar percent={category.percentSpent} />
            </View>
          ))}
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.recentTitle')}
      </Text>
      {transactionsError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isTransactionsLoading ? (
        <SkeletonList rows={3} />
      ) : recentTransactions.length === 0 ? (
        <EmptyState
          icon="🧾"
          message={t('dashboard.noTransactions')}
          actionLabel={t('transactions.addButton')}
          onAction={() => router.push('/transactions/new')}
        />
      ) : (
        <Card>
          {recentTransactions.map((txn, index) => (
            <View key={txn.id}>
              {index > 0 && (
                <View className="my-2">
                  <Divider />
                </View>
              )}
              <Pressable onPress={() => router.push(`/transactions/${txn.id}`)} accessibilityRole="button">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-sm text-ink-light dark:text-ink-dark">{txn.description}</Text>
                  <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(txn.amount_agorot)}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.analytics.trendTitle')}
      </Text>
      {analyticsError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isAnalyticsLoading ? (
        <SkeletonList rows={1} rowClassName="h-40 w-full rounded-xl" />
      ) : monthlyTrendIsEmpty ? (
        <EmptyState icon="📊" message={t('dashboard.analytics.empty')} />
      ) : (
        <Card>
          <MonthlyTrendChart points={monthlyTrendPoints} />
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.analytics.breakdownTitle')}
      </Text>
      {analyticsError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isAnalyticsLoading ? (
        <View className="items-center">
          <SkeletonList rows={1} rowClassName="h-36 w-36 rounded-full" />
        </View>
      ) : categoryBreakdown.length === 0 ? (
        <EmptyState icon="📊" message={t('dashboard.analytics.empty')} />
      ) : (
        <Card>
          <View className="items-center">
            <CategoryDonutChart breakdown={categoryBreakdown} categoryNameById={categoryNameById} />
          </View>
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.analytics.topCategoriesTitle')}
      </Text>
      {analyticsError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isAnalyticsLoading ? (
        <SkeletonList rows={3} />
      ) : topCategories.length === 0 ? (
        <EmptyState icon="📊" message={t('dashboard.analytics.empty')} />
      ) : (
        <Card>
          <TopCategoriesList
            entries={topCategories}
            categoryNameById={categoryNameById}
            categoryIconById={categoryIconById}
          />
        </Card>
      )}

      <FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />
    </Screen>
  )
}
