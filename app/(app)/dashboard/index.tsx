import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { severityIconName, severityColorToken } from '@/features/alerts/lib/alertDisplay'
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
import { DesktopPanelHeader } from '@/components/ui/DesktopPanelHeader'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'

const DESKTOP_PANEL = `web:desktop:min-h-[360px] ${DESKTOP_PANEL_CLASS}`

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

  // Fixed at the 'month' horizon on the dashboard card — the detail screen
  // (/cash-flow) is where the household switches horizons. Deliberately
  // independent of `periodStart`/MonthNavigator above: Safe-to-Spend always
  // means "from right now," never an arbitrary browsed month.
  const {
    result: safeToSpend,
    isLoading: isSafeToSpendLoading,
    error: safeToSpendError,
  } = useSafeToSpend(householdId, 'month')

  const { alerts, isLoading: isAlertsLoading } = useFinancialAlerts(householdId)
  const { colorScheme: scheme } = useColorScheme()
  // Loading/error states are deliberately silent here (unlike the primary
  // Safe-to-Spend card above): this is a secondary, optional section — the
  // full /alerts screen is where a genuine error state belongs. A single
  // failed source among the four never blanks this section anyway
  // (useFinancialAlerts.ts's own partial-availability design); it only
  // shows fewer alerts.
  const topAlerts = isAlertsLoading ? [] : alerts.slice(0, 3)

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
      <View className="mb-6 web:desktop:mb-8">
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
          {t('dashboard.title')}
        </Text>
        {/* Desktop polish pass: a short descriptive subtitle only at desktop
            — on a phone-width screen the title alone is enough context
            directly above a MonthNavigator; on a wide desktop page the bare
            title alone read as sparse next to the amount of open space
            around it. */}
        <Text className="mt-1 hidden text-caption text-inkMuted-light dark:text-inkMuted-dark web:desktop:flex">
          {t('dashboard.subtitle')}
        </Text>
      </View>

      {/* Safe-to-Spend — the household's own real cash position, not tied to
          the month navigator below (always "from right now," fixed at the
          'month' horizon here; the detail screen offers the other
          horizons). Tapping opens the itemized breakdown at /cash-flow. */}
      <Pressable
        onPress={() => router.push('/cash-flow')}
        accessibilityRole="button"
        className="mb-6 web:desktop:mb-8"
      >
        <Card className="rounded-card border border-border-light bg-surfaceMuted-light p-4 web:desktop:p-6 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
            {t('dashboard.safeToSpend.title')}
          </Text>
          {safeToSpendError ? (
            <View className="mt-1">
              <ErrorMessage message={t('cashFlow.errors.generic')} />
            </View>
          ) : isSafeToSpendLoading ? (
            <View className="mt-1">
              <SkeletonList rows={1} />
            </View>
          ) : safeToSpend.safeToSpendAgorot < 0 ? (
            <Text className="mt-1 text-heading font-bold text-danger-light dark:text-danger-dark web:desktop:text-[24px]">
              {t('dashboard.safeToSpend.shortfall', { amount: formatILS(safeToSpend.shortfallAgorot) })}
            </Text>
          ) : (
            <>
              <Text className="mt-1 text-display font-bold text-ink-light dark:text-ink-dark web:desktop:text-[44px]">
                {formatILS(safeToSpend.safeToSpendAgorot)}
              </Text>
              <Text className="mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('dashboard.safeToSpend.subtitle')}
              </Text>
              {safeToSpend.safeToSpendAgorot === 0 && (
                <Text className="mt-1 text-caption text-danger-light dark:text-danger-dark">
                  {t('dashboard.safeToSpend.zero')}
                </Text>
              )}
            </>
          )}

          {!safeToSpendError && !isSafeToSpendLoading && (
            <View className="mt-4 gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.availableCash')}
                </Text>
                <Text className="text-caption text-ink-light dark:text-ink-dark">
                  {formatILS(safeToSpend.availableCashAgorot)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.plannedObligations')}
                </Text>
                <Text className="text-caption text-ink-light dark:text-ink-dark">
                  {formatILS(-safeToSpend.plannedObligationsAgorot)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.recurringCharges')}
                </Text>
                <Text className="text-caption text-ink-light dark:text-ink-dark">
                  {formatILS(-safeToSpend.recurringAgorot)}
                </Text>
              </View>
              <View className="my-1">
                <Divider />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-caption font-semibold text-ink-light dark:text-ink-dark">
                  {t('cashFlow.safeToSpend')}
                </Text>
                <Text
                  className={`text-caption font-semibold ${
                    safeToSpend.safeToSpendAgorot < 0
                      ? 'text-danger-light dark:text-danger-dark'
                      : 'text-ink-light dark:text-ink-dark'
                  }`}
                >
                  {formatILS(safeToSpend.safeToSpendAgorot)}
                </Text>
              </View>
            </View>
          )}
        </Card>
      </Pressable>

      {/* Compact, optional section — renders nothing at all when there are
          no alerts (chosen over a persistent "everything's fine" banner:
          no existing screen in this app has that kind of standing chrome,
          and the milestone's own brief explicitly allows either choice).
          Max 3, highest-priority first (buildFinancialAlerts.ts's own
          severity→date→id sort) — the full grouped list lives at /alerts. */}
      {topAlerts.length > 0 && (
        <View className="mb-6 web:desktop:mb-8">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-ink-light dark:text-ink-dark">
              {t('alerts.dashboardSectionTitle')}
            </Text>
            <Pressable onPress={() => router.push('/alerts')} accessibilityRole="button">
              <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                {t('alerts.viewAll')}
              </Text>
            </Pressable>
          </View>
          <Card>
            {topAlerts.map((alert, index) => (
              <View key={alert.id}>
                {index > 0 && (
                  <View className="my-3">
                    <Divider />
                  </View>
                )}
                <Pressable
                  onPress={() => router.push(alert.actionRoute)}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3"
                >
                  <Ionicons
                    name={severityIconName(alert.severity)}
                    size={20}
                    color={severityColorToken(alert.severity, scheme === 'dark' ? 'dark' : 'light')}
                  />
                  <View className="flex-1">
                    <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {alert.title}
                    </Text>
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                      {alert.description}
                    </Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </Card>
        </View>
      )}

      <MonthNavigator periodStart={periodStart} onChange={setPeriodStart} />

      {progressError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isProgressLoading ? (
        <LoadingSpinner />
      ) : (
        // Desktop polish pass: extra padding + a larger hero figure at
        // desktop only (unprefixed classes are pixel-identical to before —
        // mobile is untouched). A single hero figure reads fine at phone
        // width, but the same card only using p-4 on a wide desktop page
        // looked like a mobile card stretched wide rather than a deliberate
        // desktop KPI panel.
        <Card className="rounded-card border border-border-light bg-surfaceMuted-light p-4 web:desktop:p-8 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.remaining')}</Text>
          <Text
            className={`mt-1 text-display font-bold web:desktop:text-[52px] web:desktop:leading-[58px] ${
              isOverBudget ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'
            }`}
          >
            {formatILS(remaining)}
          </Text>

          <View className="mt-4 web:desktop:mt-6">
            <ProgressBar percent={overallPercent} overBudget={isOverBudget} />
          </View>
          {overallPercent !== null && (
            <Text className="mt-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('dashboard.percentUsed', { percent: Math.round(overallPercent) })}
            </Text>
          )}

          <View className="mt-4 web:desktop:mt-6 flex-row items-center">
            <View className="flex-1">
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.spent')}</Text>
              <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark web:desktop:text-[19px]">
                {formatILS(totalSpentAgorot)}
              </Text>
            </View>
            <View className="mx-4 h-8 w-px bg-border-light dark:bg-border-dark" />
            <View className="flex-1">
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.ofBudget')}</Text>
              <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark web:desktop:text-[19px]">
                {formatILS(totalAllocatedAgorot)}
              </Text>
            </View>
          </View>
        </Card>
      )}

      <View className="hidden web:desktop:mt-6 web:desktop:flex" />

      {/* Desktop polish pass: three equally-weighted columns — לפי קטגוריה /
          תנועות אחרונות / תובנות החודש — replacing the previous 2/3-main +
          1/3-sidebar split, where the sidebar alone held all three analytics
          sub-sections stacked under separate headers while the main column
          held two unrelated sections stacked together. A real-browser visual
          review found that lopsided and cluttered; three balanced panels
          read as one coherent dashboard grid instead. `web:desktop:flex-row-
          reverse` (see _layout.tsx's DesktopSideRail comment for why
          `-reverse` is needed on web) keeps DOM/source order [categories,
          recent, insights] — categories (primary) lands rightmost, insights
          (secondary) leftmost. Mobile/tablet stay a single stacked column,
          unchanged. */}
      <View className="web:desktop:flex-row-reverse web:desktop:items-stretch web:desktop:gap-5">
        <View className="web:desktop:flex-1">
          <View className={DESKTOP_PANEL}>
            <DesktopPanelHeader icon="pie-chart-outline" title={t('dashboard.categoriesTitle')} />
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
        </View>

        <View className="web:desktop:flex-1">
          <View className={DESKTOP_PANEL}>
            <DesktopPanelHeader
              icon="receipt-outline"
              title={t('dashboard.recentTitle')}
              action={
                recentTransactions.length > 0 && (
                  <Pressable onPress={() => router.push('/transactions')} accessibilityRole="button">
                    <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                      {t('dashboard.viewAll')}
                    </Text>
                  </Pressable>
                )
              }
            />
            {transactionsError ? (
              <ErrorMessage message={t('dashboard.errors.generic')} />
            ) : isTransactionsLoading ? (
              <SkeletonList rows={3} />
            ) : recentTransactions.length === 0 ? (
              // Phase 3.1: no actionLabel here — the screen's own
              // floatingAction FAB already does the identical "add a
              // transaction" action, and showing both was a redundant,
              // competing CTA in the same empty state.
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
          <View className={DESKTOP_PANEL}>
            <DesktopPanelHeader icon="sparkles-outline" title={t('dashboard.analytics.insightsTitle')} />
            {analyticsError ? (
              <ErrorMessage message={t('dashboard.errors.generic')} />
            ) : isAnalyticsLoading ? (
              <>
                <View className="items-center">
                  <SkeletonList rows={1} rowClassName="h-36 w-36 rounded-full" />
                </View>
                <View className="mt-4">
                  <SkeletonList rows={3} />
                </View>
              </>
            ) : analyticsAllEmpty ? (
              <EmptyState iconName="sparkles-outline" message={t('dashboard.analytics.insightsEmpty')} compact />
            ) : (
              <>
                {/* Consolidated under the one "תובנות החודש" header above
                    (Design Phase 2 originally gave breakdown/top-categories/
                    trend each their own full sub-header inside this same
                    column) — donut + ranked list side by side at desktop,
                    trend chart beneath. Every section still falls through to
                    its own empty state independently when only that one is
                    empty, same as before. */}
                {categoryBreakdown.length === 0 ? (
                  <EmptyState iconName="pie-chart-outline" message={t('dashboard.analytics.empty')} compact />
                ) : (
                  <View className="web:desktop:flex-row-reverse web:desktop:items-center web:desktop:gap-5">
                    <CategoryDonutChart breakdown={categoryBreakdown} categoryNameById={categoryNameById} size={104} />
                    <View className="mt-4 web:desktop:mt-0 web:desktop:flex-1">
                      <TopCategoriesList
                        entries={topCategories}
                        categoryNameById={categoryNameById}
                        categoryIconById={categoryIconById}
                      />
                    </View>
                  </View>
                )}

                <View className="mt-5 web:desktop:mt-6">
                  <Text className="mb-2 text-caption font-medium text-inkMuted-light dark:text-inkMuted-dark">
                    {t('dashboard.analytics.trendTitle')}
                  </Text>
                  {monthlyTrendIsEmpty ? (
                    <EmptyState iconName="bar-chart-outline" message={t('dashboard.analytics.empty')} compact />
                  ) : (
                    <MonthlyTrendChart points={monthlyTrendPoints} />
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Screen>
  )
}
