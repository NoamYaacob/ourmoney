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
import { useUpcomingCommitments } from '@/features/cashflow/hooks/useUpcomingCommitments'
import { daysUntilDue, isPastDue } from '@/features/obligations/lib/upcomingObligations'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { goalProgressPercent, resolveGoalCurrentAgorot, resolveGoalIsCompleted } from '@/features/savings/lib/goalProgress'
import { usePeriodStore } from '@/store/periodStore'
import { shiftMonth, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { MonthNavigator } from '@/features/budgets/components/MonthNavigator'
import { remainingAgorot, spentPercent } from '@/lib/money/arithmetic'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
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

// Desktop Visual/Responsive Design pass: 360 -> 300, matching Budgets'
// panel floor (constants/layout.ts's DESKTOP_PANEL_CLASS itself carries no
// min-height — each screen picks its own). 360 was sized for when this row
// sat directly under a full-width, taller hero stack; with the hero row
// above now more compact, an equally tall floor here read as excess empty
// space in panels with genuinely short content (e.g. a 2-category budget).
const DESKTOP_PANEL = `web:desktop:min-h-[300px] ${DESKTOP_PANEL_CLASS}`

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

  // Migration 008 (ADR-035): a transfer's two legs share one description and
  // would otherwise render here as two separate, mis-colored rows (one
  // green like income, one plain like an expense) with no indication
  // they're the same internal movement — excluded here the same way
  // filterForAnalytics excludes them from every other summary on this
  // screen, rather than teaching this compact preview the full
  // transfer-specific row treatment app/(app)/transactions/index.tsx
  // already owns (icon, accent color, single navigation target).
  const recentTransactions = transactions.filter((t) => t.transfer_id === null).slice(0, 5)

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

  // Dashboard product redesign — C/D: unified upcoming commitments (every
  // canonical upcoming-money-out source, including each credit card's
  // current open cycle), reusing lib/engines/commitments/
  // buildUpcomingCommitments.ts via useUpcomingCommitments.ts exactly as
  // the /cash-flow screen's own new section does — no second aggregation
  // here, just the top few for a compact "at a glance" preview.
  const {
    commitments,
    isLoading: isCommitmentsLoading,
    hasPartialError: hasCommitmentsPartialError,
  } = useUpcomingCommitments(householdId)
  const today = localDateString()
  const topCommitments = commitments.slice(0, 3)
  const creditCardBurdenAgorot = commitments
    .filter((c) => c.source === 'credit_card_cycle')
    .reduce((sum, c) => sum + c.amountAgorot, 0)

  // F: savings-goals status — reusing the exact same hooks/pure helpers the
  // Goals screen itself uses (useSavingsGoals + goalProgressPercent). No
  // new query, no new calculation logic.
  const { goals, isLoading: isGoalsLoading, error: goalsError } = useSavingsGoals(householdId)
  const { balances: goalAccountBalances } = useAccountBalances(householdId)
  const topGoals = goals.filter((g) => !resolveGoalIsCompleted(g, goalAccountBalances)).slice(0, 3)

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
    transferId: t.transfer_id,
  }))
  const monthlyTrendPoints = computeMonthlyTrend(analyticsInput, last6MonthStarts)
  // The selected month's own point — last6MonthStarts's final entry is
  // always periodStart itself (shiftMonth(periodStart, -(5-5))), so this is
  // the same figure the trend chart already plots, not a second calculation.
  const thisMonthTrend = monthlyTrendPoints[monthlyTrendPoints.length - 1]
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

  // Same shared, integer-safe helper Budgets uses (lib/money/arithmetic.ts)
  // — previously a raw float ratio here, which could round to a different
  // whole percent than Budgets' Math.floor cross-multiplication for the
  // identical spent/allocated pair. One helper, one number, everywhere.
  const overallPercent = spentPercent(totalSpentAgorot, totalAllocatedAgorot)
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

      {/* Dashboard product redesign (household-financial-state hierarchy):
          A. פנוי באמת (Safe-to-Spend, including B. current available cash
          as its own breakdown line) paired here with E. this month's budget
          status — the two "where do we stand right now" numbers, side by
          side at desktop, stacked on mobile. C/D (upcoming commitments,
          including credit-card burden), F (savings), G (alerts), and H
          (recent activity) each now follow in their own section below, in
          that priority order — see the section comments further down for
          each. Alerts no longer interleaves inside this row (it previously
          did, via an `order-*` CSS trick — removed along with it now that
          it lives in its own later section, which also removes the need for
          that trick entirely). */}
      <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-5">
        <View className="mb-6 web:desktop:mb-0 web:desktop:flex-1">
          {/* Safe-to-Spend — the household's own real cash position, not tied
              to the month navigator alongside it (always "from right now,"
              fixed at the 'month' horizon here; the detail screen offers the
              other horizons). Tapping opens the itemized breakdown at
              /cash-flow. */}
          <Pressable onPress={() => router.push('/cash-flow')} accessibilityRole="button">
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
                  <Text className="mt-1 text-display font-bold text-ink-light dark:text-ink-dark web:desktop:text-[36px]">
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
        </View>

        <View className="mb-6 web:desktop:mb-0 web:desktop:flex-1">
          <MonthNavigator periodStart={periodStart} onChange={setPeriodStart} />

          {progressError ? (
            <ErrorMessage message={t('dashboard.errors.generic')} />
          ) : isProgressLoading ? (
            <LoadingSpinner />
          ) : progress.length === 0 ? (
            // Same condition the category panel below already uses for its own
            // empty state (UX-completeness audit finding: this hero card
            // previously rendered "נותר החודש ₪0.00 · 0% נוצל" for a household
            // with no budget set at all, reading as "you spent nothing against a
            // ₪0 budget" rather than "no budget exists yet"). A distinct,
            // hero-appropriate string (dashboard.noBudgetHero) is used instead
            // of reusing dashboard.noBudget verbatim — the category panel below
            // renders that exact message too, and showing the identical
            // sentence twice on one screen is its own redundancy bug, not a fix.
            <Card className="rounded-card border border-border-light bg-surfaceMuted-light p-4 web:desktop:p-6 dark:border-border-dark dark:bg-surfaceMuted-dark">
              <EmptyState iconName="wallet-outline" message={t('dashboard.noBudgetHero')} compact />
            </Card>
          ) : (
            // Desktop polish pass: extra padding + a larger hero figure at
            // desktop only (unprefixed classes are pixel-identical to before —
            // mobile is untouched). Desktop Visual/Responsive Design pass:
            // now paired side by side with Safe-to-Spend in a half-width
            // column instead of a full 1150px-wide card, so the hero figure
            // size/padding was brought back in line with Safe-to-Spend's own
            // (both were sized for a full-width card that no longer exists
            // at desktop).
            <Card className="rounded-card border border-border-light bg-surfaceMuted-light p-4 web:desktop:p-6 dark:border-border-dark dark:bg-surfaceMuted-dark">
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.remaining')}</Text>
              <Text
                className={`mt-1 text-display font-bold web:desktop:text-[36px] ${
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
                  {t('dashboard.percentUsed', { percent: overallPercent })}
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
        </View>
      </View>

      {/* Dashboard product redesign — C/D: upcoming commitments (including
          credit-card burden) is now the primary panel in this row (DOM
          FIRST, so `flex-row-reverse` renders it rightmost — this row
          previously had this-month income/expense DOM-first/rightmost;
          commitments takes that spot now, reflecting its higher priority in
          the new A-H hierarchy), followed by this month's income/expense as
          a secondary stat. F: savings-goal progress stays the row's third
          panel, unchanged. Same three-panel convention as the analytics row
          below it (DESKTOP_PANEL/DesktopPanelHeader). Mobile/tablet stay a
          single stacked column, in the same [commitments, thisMonth, goals]
          DOM order. */}
      <View className="mt-6 web:desktop:mt-5 web:desktop:flex-row-reverse web:desktop:items-stretch web:desktop:gap-5">
        <View className="mb-6 web:desktop:mb-0 web:desktop:flex-1">
          <View className={DESKTOP_PANEL}>
            <DesktopPanelHeader
              icon="calendar-outline"
              title={t('dashboard.commitments.title')}
              action={
                topCommitments.length > 0 && (
                  <Pressable onPress={() => router.push('/cash-flow')} accessibilityRole="button">
                    <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                      {t('dashboard.commitments.viewAll')}
                    </Text>
                  </Pressable>
                )
              }
            />
            {hasCommitmentsPartialError && (
              <View className="mb-2">
                <ErrorMessage message={t('cashFlow.commitments.errors.partial')} />
              </View>
            )}
            {creditCardBurdenAgorot > 0 && (
              <Text className="mb-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('dashboard.commitments.creditCardBurden', { amount: formatILS(creditCardBurdenAgorot) })}
              </Text>
            )}
            {isCommitmentsLoading ? (
              <SkeletonList rows={2} />
            ) : topCommitments.length === 0 ? (
              <EmptyState iconName="calendar-outline" message={t('dashboard.commitments.empty')} compact />
            ) : (
              <Card>
                {topCommitments.map((item, index) => {
                  const pastDue = isPastDue(item.date, today)
                  const days = daysUntilDue(item.date, today)
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() =>
                        item.source === 'obligation'
                          ? router.push(`/obligations/${item.sourceId}`)
                          : item.source === 'recurring'
                            ? router.push(`/recurring/${item.sourceId}`)
                            : item.source === 'installment'
                              ? router.push(`/installments/${item.sourceId}`)
                              : router.push(`/accounts/${item.sourceId}`)
                      }
                      accessibilityRole="button"
                    >
                      {index > 0 && (
                        <View className="my-3">
                          <Divider />
                        </View>
                      )}
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                            {item.description}
                          </Text>
                          <Text
                            className={`text-caption ${
                              pastDue ? 'text-danger-light dark:text-danger-dark' : 'text-inkMuted-light dark:text-inkMuted-dark'
                            }`}
                          >
                            {formatDateDisplay(item.date)}
                            {' · '}
                            {pastDue
                              ? t('obligations.pastDue')
                              : days === 0
                                ? t('obligations.dueToday')
                                : t('obligations.inDays', { count: days })}
                          </Text>
                        </View>
                        <Text className="text-body font-medium text-ink-light dark:text-ink-dark">
                          {formatILS(item.amountAgorot)}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </Card>
            )}
          </View>
        </View>

        <View className="mb-6 web:desktop:mb-0 web:desktop:flex-1">
          <View className={DESKTOP_PANEL}>
            <DesktopPanelHeader icon="swap-vertical-outline" title={t('dashboard.thisMonth.title')} />
            <Card>
              <View className="flex-row items-center">
                <View className="flex-1">
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {t('dashboard.analytics.income')}
                  </Text>
                  <Text className="mt-0.5 text-heading font-semibold text-positive-light dark:text-positive-dark">
                    {formatILS(thisMonthTrend?.incomeAgorot ?? 0)}
                  </Text>
                </View>
                <View className="mx-4 h-8 w-px bg-border-light dark:bg-border-dark" />
                <View className="flex-1">
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {t('dashboard.analytics.expense')}
                  </Text>
                  <Text className="mt-0.5 text-heading font-semibold text-ink-light dark:text-ink-dark">
                    {formatILS(thisMonthTrend?.expenseAgorot ?? 0)}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        </View>

        <View className="mb-6 web:desktop:mb-0 web:desktop:flex-1">
          <View className={DESKTOP_PANEL}>
            <DesktopPanelHeader
              icon="flag-outline"
              title={t('dashboard.savingsGoalsWidget.title')}
              action={
                topGoals.length > 0 && (
                  <Pressable onPress={() => router.push('/goals')} accessibilityRole="button">
                    <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                      {t('dashboard.savingsGoalsWidget.viewAll')}
                    </Text>
                  </Pressable>
                )
              }
            />
            {goalsError ? (
              <ErrorMessage message={t('dashboard.errors.generic')} />
            ) : isGoalsLoading ? (
              <SkeletonList rows={2} />
            ) : topGoals.length === 0 ? (
              <EmptyState iconName="flag-outline" message={t('dashboard.savingsGoalsWidget.empty')} compact />
            ) : (
              <Card>
                {topGoals.map((goal, index) => {
                  const currentAgorot = resolveGoalCurrentAgorot(goal, goalAccountBalances)
                  const percent = goalProgressPercent(currentAgorot, goal.target_agorot)
                  return (
                    <Pressable key={goal.id} onPress={() => router.push(`/goals/${goal.id}`)} accessibilityRole="button">
                      {index > 0 && (
                        <View className="my-3">
                          <Divider />
                        </View>
                      )}
                      <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {goal.name}
                      </Text>
                      <Text className="mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                        {formatILS(currentAgorot)} / {formatILS(goal.target_agorot)}
                      </Text>
                      <View className="mt-1.5">
                        <ProgressBar percent={percent} positiveAtLimit />
                      </View>
                    </Pressable>
                  )
                })}
              </Card>
            )}
          </View>
        </View>
      </View>

      {/* Dashboard product redesign — G: alerts requiring attention, now its
          own standalone full-width section (previously interleaved inside
          the Safe-to-Spend/budget-hero row via a CSS `order-*` trick — see
          that row's own comment above). Renders nothing at all when there
          are no alerts (chosen over a persistent "everything's fine" banner
          — no other screen in this app has that kind of standing chrome).
          Max 3, highest-priority first (buildFinancialAlerts.ts's own
          severity→date→id sort) — the full grouped list lives at /alerts.
          The header + "כל ההתראות" link is always visible even with zero
          current alerts, so /alerts stays reachable from the Dashboard
          either way (UX-completeness audit finding this originally fixed). */}
      {!isAlertsLoading && (
        <View className="mt-6">
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
          {topAlerts.length > 0 && (
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
          )}
        </View>
      )}

      <View className="hidden web:desktop:mt-2 web:desktop:flex" />

      {/* Desktop polish pass: three equally-weighted columns — לפי קטגוריה /
          תנועות אחרונות / תובנות החודש — replacing the previous 2/3-main +
          1/3-sidebar split, where the sidebar alone held all three analytics
          sub-sections stacked under separate headers while the main column
          held two unrelated sections stacked together. A real-browser visual
          review found that lopsided and cluttered; three balanced panels
          read as one coherent dashboard grid instead. `web:desktop:flex-
          row-reverse` (see _layout.tsx's DesktopSideRail comment for why
          `-reverse` is needed on web) keeps DOM/source order [categories,
          recent, insights] — categories (primary) lands rightmost, insights
          (secondary) leftmost. Visual QA + Desktop Polish pass: this had
          silently regressed to plain `flex-row` (categories rendering on
          the LEFT) — the dedicated regression test below only ever checked
          `.toContain('web:desktop:flex-row')`, a substring both forms
          satisfy, so it never caught the drift. Restored to `-reverse` and
          the test tightened to exact-token matching so it can't happen
          again unnoticed. Mobile/tablet stay a single stacked column,
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
                  <View className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-5">
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
