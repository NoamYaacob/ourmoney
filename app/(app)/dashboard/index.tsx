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
import { MonthNavigator } from '@/features/budgets/components/MonthNavigator'
import { remainingAgorot } from '@/lib/money/arithmetic'
import { formatILS } from '@/lib/money/format'
import { computeMonthlyTrend } from '@/features/analytics/lib/monthlyTrend'
import { computeCategoryBreakdown } from '@/features/analytics/lib/categoryBreakdown'
import { computeTopCategories } from '@/features/analytics/lib/topCategories'
import { MonthlyTrendChart } from '@/features/analytics/components/MonthlyTrendChart'
import { CategoryDonutChart } from '@/features/analytics/components/CategoryDonutChart'
import { TopCategoriesList } from '@/features/analytics/components/TopCategoriesList'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'

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
  // Design Phase 2: when there is genuinely nothing to show yet, the three
  // analytics sections used to each reserve their own chart-sized empty
  // block — three near-identical "not enough data" messages stacked one
  // after another. Collapsed into a single compact state instead (item 4).
  // Still per-section correct: if only some are empty (e.g. the 6-month
  // trend has an older month's data but the current month has none), each
  // section falls through to its own normal empty/populated rendering below
  // exactly as in Phase 1 — only the realistic "brand new household" case
  // of all three empty at once gets the combined treatment.
  const analyticsAllEmpty = monthlyTrendIsEmpty && categoryBreakdown.length === 0 && topCategories.length === 0

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

  const overallPercent = totalAllocatedAgorot > 0 ? (totalSpentAgorot / totalAllocatedAgorot) * 100 : null
  const remaining = remainingAgorot(totalAllocatedAgorot, totalSpentAgorot)
  const isOverBudget = totalAllocatedAgorot > 0 && totalSpentAgorot > totalAllocatedAgorot

  return (
    <Screen
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      <Text className="mb-6 text-title font-bold text-ink-light dark:text-ink-dark">{t('dashboard.title')}</Text>

      <MonthNavigator periodStart={periodStart} onChange={setPeriodStart} />

      {progressError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isProgressLoading ? (
        <LoadingSpinner />
      ) : (
        <Card>
          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.remaining')}</Text>
          <Text
            className={`mt-1 text-display font-bold ${
              isOverBudget ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'
            }`}
          >
            {formatILS(remaining)}
          </Text>

          <View className="mt-4">
            <ProgressBar percent={overallPercent} overBudget={isOverBudget} />
          </View>
          {overallPercent !== null && (
            <Text className="mt-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('dashboard.percentUsed', { percent: Math.round(overallPercent) })}
            </Text>
          )}

          <View className="mt-4 flex-row items-center">
            <View className="flex-1">
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.spent')}</Text>
              <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark">
                {formatILS(totalSpentAgorot)}
              </Text>
            </View>
            <View className="mx-4 h-8 w-px bg-border-light dark:bg-border-dark" />
            <View className="flex-1">
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.ofBudget')}</Text>
              <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark">
                {formatILS(totalAllocatedAgorot)}
              </Text>
            </View>
          </View>
        </Card>
      )}

      {/* Desktop polish pass: each lower section now renders as its own
          bordered panel (see below), which already reads as clearly
          grouped away from the hero — a plain spacer replaces the earlier
          standalone divider line, which looked redundant stacked directly
          above a panel's own top border. Desktop-only; mobile/tablet
          spacing is untouched. */}
      <View className="hidden web:desktop:mt-6 web:desktop:flex" />

      {/* Responsive/desktop pass: below the hero, a 2/3 main column
          (category budgets + recent transactions) and a 1/3 sidebar
          (analytics/insights) — desktop only (`web:desktop:flex-row-reverse`,
          see _layout.tsx's DesktopSideRail comment for why `-reverse` is
          needed on web). Reversing keeps source/DOM order as [main,
          sidebar] (primary content announced first) while visually placing
          the primary column on the right and the sidebar on the left — the
          correct RTL reading order. Mobile and tablet stay a single stacked
          column, unchanged, since the plain View default (flexDirection:
          column) already renders these two wrappers one after another in
          source order. */}
      <View className="web:desktop:flex-row-reverse web:desktop:items-start web:desktop:gap-6">
        <View className="web:desktop:flex-[2]">
          {/* Desktop polish pass: each section below becomes its own bounded
              panel (border + surface tone, existing tokens only) at desktop
              — a real-browser visual check found the lower Dashboard
              reading as loosely related content floating on a large blank
              canvas when data is sparse. Mobile/tablet keep the original
              unwrapped heading + Card/EmptyState layout exactly as before
              (`web:desktop:` scoped). */}
          <View className="web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surface-light web:desktop:p-4 dark:web:desktop:border-border-dark dark:web:desktop:bg-surface-dark">
          <Text className="mb-2 mt-6 web:desktop:mt-0 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.categoriesTitle')}
          </Text>
      {isProgressLoading ? (
        <SkeletonList rows={3} />
      ) : progressError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : progress.length === 0 ? (
        <EmptyState iconName="pie-chart-outline" message={t('dashboard.noBudget')} compact />
      ) : (
        <Card>
          {progress.map((category, index) => {
            const categoryOverBudget = category.remainingAgorot < 0
            return (
              <View key={category.categoryId}>
                {index > 0 && (
                  <View className="my-3">
                    <Divider />
                  </View>
                )}
                <View className="flex-row items-start gap-3">
                  <CategoryIcon icon={category.categoryIcon} size="sm" />
                  <View className="flex-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-body text-ink-light dark:text-ink-dark">{category.categoryNameHe}</Text>
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                        {formatILS(category.spentAgorot)} / {formatILS(category.allocatedAgorot)}
                      </Text>
                    </View>
                    <View className="mt-1.5">
                      <ProgressBar percent={category.percentSpent} overBudget={categoryOverBudget} />
                    </View>
                    <Text
                      className={`mt-1 text-caption ${
                        categoryOverBudget
                          ? 'text-danger-light dark:text-danger-dark'
                          : 'text-positive-light dark:text-positive-dark'
                      }`}
                    >
                      {categoryOverBudget
                        ? t('dashboard.categoryExceeded', { amount: formatILS(Math.abs(category.remainingAgorot)) })
                        : t('dashboard.categoryRemaining', { amount: formatILS(category.remainingAgorot) })}
                    </Text>
                  </View>
                </View>
              </View>
            )
          })}
        </Card>
      )}
          </View>

          <View className="web:desktop:mt-4 web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surface-light web:desktop:p-4 dark:web:desktop:border-border-dark dark:web:desktop:bg-surface-dark">
      <View className="mb-2 mt-6 web:desktop:mt-0 flex-row items-center justify-between">
        <Text className="text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
          {t('dashboard.recentTitle')}
        </Text>
        {recentTransactions.length > 0 && (
          <Pressable onPress={() => router.push('/transactions')} accessibilityRole="button">
            <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
              {t('dashboard.viewAll')}
            </Text>
          </Pressable>
        )}
      </View>
      {transactionsError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isTransactionsLoading ? (
        <SkeletonList rows={3} />
      ) : recentTransactions.length === 0 ? (
        // Phase 3.1: no actionLabel here — the screen's own floatingAction
        // FAB already does the identical "add a transaction" action, and
        // showing both was a redundant, competing CTA in the same empty
        // state (also compacted, matching the other Dashboard sections).
        <EmptyState iconName="receipt-outline" message={t('dashboard.noTransactions')} compact />
      ) : (
        <Card>
          {recentTransactions.map((txn, index) => {
            const categoryName = txn.category_id ? categoryNameById[txn.category_id] : undefined
            return (
              <View key={txn.id}>
                {index > 0 && (
                  <View className="my-3">
                    <Divider />
                  </View>
                )}
                <Pressable
                  onPress={() => router.push(`/transactions/${txn.id}`)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3"
                >
                  <CategoryIcon icon={txn.category_id ? categoryIconById[txn.category_id] : undefined} size="sm" />
                  <View className="flex-1">
                    <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {txn.description}
                    </Text>
                    {categoryName && (
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                        {categoryName}
                      </Text>
                    )}
                  </View>
                  <Text
                    className={`text-body font-medium ${
                      txn.amount_agorot > 0
                        ? 'text-positive-light dark:text-positive-dark'
                        : 'text-ink-light dark:text-ink-dark'
                    }`}
                  >
                    {formatILS(txn.amount_agorot)}
                  </Text>
                </Pressable>
              </View>
            )
          })}
        </Card>
      )}
          </View>
        </View>

        <View className="web:desktop:flex-1">
          <View className="web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surface-light web:desktop:p-4 dark:web:desktop:border-border-dark dark:web:desktop:bg-surface-dark">
      {analyticsError ? (
        <>
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.trendTitle')}
          </Text>
          <ErrorMessage message={t('dashboard.errors.generic')} />
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.breakdownTitle')}
          </Text>
          <ErrorMessage message={t('dashboard.errors.generic')} />
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.topCategoriesTitle')}
          </Text>
          <ErrorMessage message={t('dashboard.errors.generic')} />
        </>
      ) : isAnalyticsLoading ? (
        <>
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.trendTitle')}
          </Text>
          <SkeletonList rows={1} rowClassName="h-40 w-full rounded-card" />
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.breakdownTitle')}
          </Text>
          <View className="items-center">
            <SkeletonList rows={1} rowClassName="h-36 w-36 rounded-full" />
          </View>
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.topCategoriesTitle')}
          </Text>
          <SkeletonList rows={3} />
        </>
      ) : analyticsAllEmpty ? (
        <>
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.insightsTitle')}
          </Text>
          <EmptyState iconName="sparkles-outline" message={t('dashboard.analytics.insightsEmpty')} compact />
        </>
      ) : (
        <>
          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.trendTitle')}
          </Text>
          {monthlyTrendIsEmpty ? (
            <EmptyState iconName="bar-chart-outline" message={t('dashboard.analytics.empty')} compact />
          ) : (
            <Card>
              <MonthlyTrendChart points={monthlyTrendPoints} />
            </Card>
          )}

          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.breakdownTitle')}
          </Text>
          {categoryBreakdown.length === 0 ? (
            <EmptyState iconName="pie-chart-outline" message={t('dashboard.analytics.empty')} compact />
          ) : (
            <Card>
              <View className="items-center">
                <CategoryDonutChart breakdown={categoryBreakdown} categoryNameById={categoryNameById} />
              </View>
            </Card>
          )}

          <Text className="mb-2 mt-6 text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.analytics.topCategoriesTitle')}
          </Text>
          {topCategories.length === 0 ? (
            <EmptyState iconName="pie-chart-outline" message={t('dashboard.analytics.empty')} compact />
          ) : (
            <Card>
              <TopCategoriesList
                entries={topCategories}
                categoryNameById={categoryNameById}
                categoryIconById={categoryIconById}
              />
            </Card>
          )}
        </>
      )}
          </View>
        </View>
      </View>
    </Screen>
  )
}
