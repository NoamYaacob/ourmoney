// Desktop Claude Design pass. Rebuilt from scratch to match the approved
// `OurMoney - Desktop.dc.html` Home screen composition: a dark פנוי באמת
// hero (left column) paired with "מה מגיע" (right column), then a
// three-panel row (budget pace / needs-attention / recent transactions).
// The previous composition's own header comment claimed this layout WAS
// the approved design — it wasn't; the real mockup was never built. Every
// hook, query, and calculation below is unchanged from before this pass;
// only what renders and how it's arranged changed.
//
// The mockup's monthly-trend/category-donut analytics grid does not appear
// on this screen at all — it's the Budget screen's own right column there.
// That section (and the useTransactions/useCategories calls that only fed
// it) moves with it in the Budget screen's own rebuild, not duplicated here.
//
// Renders only at >=1200px on web (app/(app)/dashboard/index.tsx picks
// between this and MobileHome), so every class below is desktop-scoped —
// this component is simply never mounted at any other width.

import { useState } from 'react'
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
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'
import { budgetState, BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE } from '@/features/budgets/lib/budgetState'
import { usePeriodStore } from '@/store/periodStore'
import { shiftMonth, formatMonthLabel, getPeriodEnd, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { Screen } from '@/components/ui/Screen'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { HeroPanel, HeroLabel, HeroNote, HeroTag, HeroLegendRow } from '@/components/ui/HeroPanel'
import { Money } from '@/components/ui/Money'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { StatusChip } from '@/components/ui/StatusChip'
import { CommitmentRow } from '@/components/ui/CommitmentRow'
import { commitmentUrgency } from '@/features/dashboard/lib/commitmentUrgency'
import { CountdownRing } from '@/components/ui/CountdownRing'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { DESKTOP_CARD_CLASS } from '@/constants/layout'

const HORIZON_ORDER: HorizonKind[] = ['week', 'month', 'days30']
const HORIZON_PILL_KEY: Record<HorizonKind, string> = {
  week: 'dashboard.hero.horizonWeek',
  month: 'dashboard.hero.horizonMonth',
  days30: 'dashboard.hero.horizonDays30',
}

// Real MVP-2 dashboard, replacing the M1 placeholder. Every figure here is
// either a direct query result or derived via lib/money — never a bare `0`
// on a pending/failed query (fail-safe display principle, M6 plan §6).
export function DesktopDashboard() {
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
  const { categories: allCategories } = useCategories(householdId)
  const categoryNameById = Object.fromEntries(allCategories.map((c) => [c.id, c.name_he]))
  const categoryIconById = Object.fromEntries(allCategories.map((c) => [c.id, c.icon]))

  // Migration 008 (ADR-035): a transfer's two legs share one description and
  // would otherwise render here as two separate, mis-colored rows — excluded
  // here the same way filterForAnalytics excludes them from every other
  // summary on this screen.
  const recentTransactions = transactions.filter((t) => t.transfer_id === null).slice(0, 5)

  // Matches the mockup's own שבוע/חודש/30 ימים toggle on the hero —
  // useSafeToSpend already accepts any of the three HorizonKind values (the
  // Cash Flow/Safe-to-Spend detail screens already use it this way); the
  // desktop dashboard was the one caller still hard-coding 'month'.
  const [horizon, setHorizon] = useState<HorizonKind>('month')
  const {
    result: safeToSpend,
    isLoading: isSafeToSpendLoading,
    error: safeToSpendError,
  } = useSafeToSpend(householdId, horizon)

  const { alerts, isLoading: isAlertsLoading } = useFinancialAlerts(householdId)
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? '#a9a79e' : '#57564f'
  const topAlerts = isAlertsLoading ? [] : alerts.slice(0, 4)

  const {
    commitments,
    isLoading: isCommitmentsLoading,
    hasPartialError: hasCommitmentsPartialError,
  } = useUpcomingCommitments(householdId)
  const today = localDateString()
  const topCommitments = commitments.slice(0, 4)
  const totalCommitmentsAgorot = commitments.reduce((sum, c) => sum + c.amountAgorot, 0)
  // The nearest credit-card cycle among the same commitments the panel
  // above already lists — no second query, just picking the one entry the
  // hero's footer note and the "מה מגיע" footer widget both want.
  const nextCardCycle = commitments.find((c) => c.source === 'credit_card_cycle')
  const nextCardCycleDays = nextCardCycle ? daysUntilDue(nextCardCycle.date, today) : null

  // A household is shown this specific warning only when it's true of their
  // own numbers — comparing two already-computed figures (safeToSpend, the
  // nearest commitment), not a new financial calculation.
  const nearestCommitmentExceedsSafeToSpend =
    !isSafeToSpendLoading &&
    !isCommitmentsLoading &&
    commitments.length > 0 &&
    safeToSpend.safeToSpendAgorot >= 0 &&
    (commitments[0]?.amountAgorot ?? 0) > safeToSpend.safeToSpendAgorot

  // Fail-safe display: while useHousehold is still resolving, householdId
  // is null and every downstream hook below is `enabled: false` — without
  // this gate the screen would render a fully "loaded"-looking ₪0.00
  // summary indistinguishable from a real zero-spend household.
  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  const periodEnd = getPeriodEnd(periodStart)
  const pace = budgetState({
    allocatedAgorot: totalAllocatedAgorot,
    spentAgorot: totalSpentAgorot,
    periodStart,
    periodEnd,
    today,
  })
  const remainingAgorotValue = totalAllocatedAgorot - totalSpentAgorot
  const hasShortfall = safeToSpend.safeToSpendAgorot < 0

  return (
    <Screen
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      {/* The screen title, month stepper, search field and primary action
          that used to sit here are now the shell's DesktopTopBar
          (components/ui/DesktopTopBar.tsx). The mockup draws them as a 68px
          white band above the content column, identical on every desktop
          screen — not as a row inside one screen's body, which is why no
          other desktop screen used to have them at all. */}

      {/* Row 1 — פנוי באמת hero (right, mockup's DOM-first column) + מה מגיע
          (left). flex-row-reverse keeps DOM order [hero, מה מגיע] while the
          hero lands rightmost, matching the mockup exactly. */}
      <View className="web:desktop:flex-row web:desktop:items-stretch web:desktop:gap-5">
        <View className="web:desktop:w-[440px] web:desktop:flex-none">
          <HeroPanel className="web:desktop:h-full">
            <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
              <HeroLabel>{t('dashboard.hero.label')}</HeroLabel>
              <View className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-1.5">
                {HORIZON_ORDER.map((value) => (
                  <Pressable key={value} onPress={() => setHorizon(value)} accessibilityRole="button">
                    <Text
                      className={
                        value === horizon
                          ? 'text-meta font-sansSemibold text-heroInk-light'
                          : 'text-meta font-sansMedium text-heroInkMuted-light'
                      }
                    >
                      {t(HORIZON_PILL_KEY[value])}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {safeToSpendError ? (
              <View className="mt-2">
                <ErrorMessage message={t('cashFlow.errors.generic')} />
              </View>
            ) : isSafeToSpendLoading ? (
              <View className="mt-2">
                <SkeletonList rows={1} />
              </View>
            ) : (
              <>
                {/* A negative safe-to-spend is a SHORTFALL, and `Money`
                    renders magnitudes — so printing the raw figure here made
                    "-7,600" look identical to "7,600 available", next to a
                    chip claiming it merely was not the bank balance. The
                    shortfall is named instead, the same way the mobile hero
                    already did. */}
                <View className="mt-2">
                  <Money
                    agorot={hasShortfall ? safeToSpend.shortfallAgorot : safeToSpend.safeToSpendAgorot}
                    size="hero"
                    tone="hero"
                  />
                </View>
                <View className="web:desktop:mt-2.5 web:desktop:flex-row web:desktop:items-center web:desktop:gap-2.5">
                  <HeroTag>
                    {hasShortfall ? t('home.hero.shortfallTag') : t('dashboard.hero.notBankBalance')}
                  </HeroTag>
                  {!hasShortfall && safeToSpend.safeToSpendAgorot > 0 && (
                    <HeroNote>
                      {t('dashboard.hero.perDay', { amount: formatILS(Math.round(safeToSpend.safeToSpendAgorot / 30)) })}
                    </HeroNote>
                  )}
                </View>
                {hasShortfall && <HeroNote className="mt-2">{t('home.hero.shortfallNote')}</HeroNote>}

                <View className="web:desktop:mt-5 web:desktop:h-9 web:desktop:flex-row web:desktop:gap-0.5 web:desktop:overflow-hidden web:desktop:rounded-control">
                  <View className="web:desktop:bg-accent-light dark:web:desktop:bg-accent-dark" style={{ flexGrow: Math.max(1, safeToSpend.availableCashAgorot) }} />
                  <View className="web:desktop:bg-heroBorder-light" style={{ flexGrow: Math.max(1, safeToSpend.plannedObligationsAgorot) }} />
                  <View className="web:desktop:bg-hero-dark" style={{ flexGrow: Math.max(1, safeToSpend.recurringAgorot) }} />
                </View>

                {/* The waterfall legend, in the mockup's own order: the
                    answer first, then each thing subtracted from the
                    balance, then the balance itself as the closing total.
                    Each row carries the colour of the bar segment above it —
                    without that key the bar is just three grey blocks. */}
                <View className="web:desktop:mt-4 web:desktop:gap-2.5">
                  <HeroLegendRow label={t('cashFlow.safeToSpend')} swatchColor={colors.accent.light} emphasis>
                    <Money agorot={safeToSpend.safeToSpendAgorot} size="caption" tone="hero" />
                  </HeroLegendRow>
                  <HeroLegendRow label={t('cashFlow.plannedObligations')} swatchColor={colors.heroBorder.light}>
                    <Money agorot={safeToSpend.plannedObligationsAgorot} size="caption" tone="heroMuted" />
                  </HeroLegendRow>
                  <HeroLegendRow label={t('cashFlow.recurringCharges')} swatchColor={colors.inkMuted.light}>
                    <Money agorot={safeToSpend.recurringAgorot} size="caption" tone="heroMuted" />
                  </HeroLegendRow>
                  <View className="web:desktop:h-px web:desktop:bg-heroBorder-light" />
                  <HeroLegendRow label={t('cashFlow.availableCash')} emphasis>
                    <Money agorot={safeToSpend.availableCashAgorot} size="caption" tone="hero" />
                  </HeroLegendRow>
                </View>


                {nearestCommitmentExceedsSafeToSpend && commitments[0] && (
                  <Pressable
                    onPress={() => router.push('/cash-flow')}
                    accessibilityRole="button"
                    className="web:desktop:mt-auto web:desktop:flex-row web:desktop:items-center web:desktop:gap-2 web:desktop:pt-4"
                  >
                    <Ionicons name="alert-circle" size={ICON.row} color="#e8a79b" />
                    <HeroNote className="web:desktop:flex-1">
                      {t('dashboard.hero.overspendWarning', {
                        date: formatDateDisplay(commitments[0].date),
                      })}{' '}
                      <Text className="text-caption font-sansSemibold text-heroAccent-light">{t('dashboard.hero.viewCashFlow')}</Text>
                    </HeroNote>
                  </Pressable>
                )}
              </>
            )}
          </HeroPanel>
        </View>

        <View className="web:desktop:flex-1">
          <View className={`web:desktop:h-full ${DESKTOP_CARD_CLASS}`}>
            <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
              <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:desktop:text-[18px]">
                {t('dashboard.commitments.title')}
              </Text>
              {topCommitments.length > 0 && (
                <Pressable onPress={() => router.push('/cash-flow')} accessibilityRole="button">
                  <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                    {t('dashboard.commitments.viewAllShort')}
                  </Text>
                </Pressable>
              )}
            </View>
            {commitments.length > 0 && (
              <Text className="mt-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('dashboard.commitments.countAndTotal', { count: commitments.length, amount: formatILS(totalCommitmentsAgorot) })}
              </Text>
            )}

            {hasCommitmentsPartialError && (
              <View className="mt-2">
                <ErrorMessage message={t('cashFlow.commitments.errors.partial')} />
              </View>
            )}

            {isCommitmentsLoading ? (
              <View className="mt-4">
                <SkeletonList rows={3} />
              </View>
            ) : topCommitments.length === 0 ? (
              <View className="mt-4">
                <EmptyState iconName="calendar-outline" message={t('dashboard.commitments.empty')} compact />
              </View>
            ) : (
              <View className="web:desktop:mt-5">
                {topCommitments.map((item, index) => {
                  // The same urgency banding the mobile Home uses, so one
                  // charge cannot read as urgent on one platform and routine
                  // on the other.
                  const urgency = commitmentUrgency(today, item.date)
                  const timeLabel =
                    urgency.labelKey === 'inDays'
                      ? t('home.next.inDays', { count: urgency.count })
                      : t(`home.next.${urgency.labelKey}`)
                  return (
                    <View
                      key={item.id}
                      className={index > 0 ? 'border-t border-divider-light dark:border-divider-dark' : ''}
                    >
                      <CommitmentRow
                        date={item.date}
                        name={item.description}
                        amountAgorot={item.amountAgorot}
                        timeLabel={timeLabel}
                        tone={urgency.tone}
                        meta={t(`cashFlow.commitments.source.${item.source}`)}
                        onPress={() =>
                          item.source === 'obligation'
                            ? router.push(`/obligations/${item.sourceId}`)
                            : item.source === 'recurring'
                              ? router.push(`/recurring/${item.sourceId}`)
                              : item.source === 'installment'
                                ? router.push(`/installments/${item.sourceId}`)
                                : router.push(`/accounts/${item.sourceId}`)
                        }
                      />
                    </View>
                  )
                })}
              </View>
            )}

            {nextCardCycle && nextCardCycleDays !== null && (
              <View className="web:desktop:mt-auto web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:border-t web:desktop:border-border-light web:desktop:pt-4 dark:web:desktop:border-border-dark">
                <CountdownRing percentElapsed={100 - Math.max(0, Math.min(100, (nextCardCycleDays / 30) * 100))} daysLeft={nextCardCycleDays} />
                <Text className="web:desktop:flex-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('dashboard.commitments.cardCycleClosing', {
                    name: nextCardCycle.description,
                    date: formatDateDisplay(nextCardCycle.date),
                    amount: formatILS(nextCardCycle.amountAgorot),
                  })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Row 2 — קצב תקציב (primary, DOM-first/rightmost) · דורש טיפול ·
          תנועות אחרונות. */}
      <View className="web:desktop:mt-5 web:desktop:flex-row web:desktop:items-stretch web:desktop:gap-5">
        <View className="web:desktop:flex-1">
          <View className={`web:desktop:h-full ${DESKTOP_CARD_CLASS}`}>
            <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
              <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:desktop:text-[18px]">
                {t('dashboard.budgetPace.title')}
              </Text>
              <Pressable onPress={() => router.push('/budgets')} accessibilityRole="button">
                <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                  {t('dashboard.budgetPace.viewAll')}
                </Text>
              </Pressable>
            </View>

            {progressError ? (
              <View className="mt-3">
                <ErrorMessage message={t('dashboard.errors.generic')} />
              </View>
            ) : isProgressLoading ? (
              <View className="mt-3">
                <SkeletonList rows={3} />
              </View>
            ) : progress.length === 0 ? (
              <View className="mt-3">
                <EmptyState iconName="pie-chart-outline" message={t('dashboard.noBudgetHero')} compact />
              </View>
            ) : (
              <>
                <View className="web:desktop:mt-3 web:desktop:flex-row web:desktop:items-baseline web:desktop:gap-2.5">
                  <Money agorot={remainingAgorotValue} size="large" tone={remainingAgorotValue < 0 ? 'danger' : 'default'} />
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {t('dashboard.budgetPace.outOf', { amount: formatILS(totalAllocatedAgorot) })}
                  </Text>
                </View>
                {pace.percentSpent !== null && (
                  <View className="web:desktop:mt-2.5">
                    <BudgetBar
                      percent={pace.percentSpent}
                      pacePercent={pace.pacePercent}
                      state={pace.state}
                      height={9}
                      accessibilityLabel={t('dashboard.budgetPace.title')}
                    />
                  </View>
                )}
                {pace.hasProjection && pace.state !== 'healthy' && (
                  <Text className="web:desktop:mt-2 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {t('dashboard.budgetPace.projection', { amount: formatILS(pace.projectedOverspendAgorot) })}
                  </Text>
                )}

                <View className="web:desktop:mt-5 web:desktop:gap-3.5">
                  {progress.slice(0, 4).map((category) => {
                    const catState = budgetState({
                      allocatedAgorot: category.allocatedAgorot,
                      spentAgorot: category.spentAgorot,
                      periodStart,
                      periodEnd,
                      today,
                    })
                    return (
                      <View key={category.categoryId}>
                        <View className="web:desktop:flex-row web:desktop:items-baseline web:desktop:justify-between">
                          <View className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-2">
                            <CategoryIcon icon={category.categoryIcon} size="sm" />
                            <Text className="text-body font-sansMedium text-ink-light dark:text-ink-dark">
                              {category.categoryNameHe}
                            </Text>
                            {catState.percentSpent !== null && catState.state !== 'healthy' && (
                              <StatusChip label={t(BUDGET_STATE_LABEL_KEY[catState.state])} tone={BUDGET_STATE_TONE[catState.state]} />
                            )}
                          </View>
                          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                            {formatILS(category.spentAgorot)} / {formatILS(category.allocatedAgorot)}
                          </Text>
                        </View>
                        {catState.percentSpent !== null && (
                          <View className="web:desktop:mt-1.5">
                            <BudgetBar
                              percent={catState.percentSpent}
                              pacePercent={catState.pacePercent}
                              state={catState.state}
                              accessibilityLabel={category.categoryNameHe}
                            />
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              </>
            )}
          </View>
        </View>

        <View className="web:desktop:w-[300px] web:desktop:flex-none">
          <View className={`web:desktop:h-full ${DESKTOP_CARD_CLASS}`}>
            <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
              <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('dashboard.needsAttention.title')}
              </Text>
              <Pressable onPress={() => router.push('/alerts')} accessibilityRole="button">
                <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                  {t('alerts.viewAll')}
                </Text>
              </Pressable>
            </View>
            {isAlertsLoading ? (
              <View className="web:desktop:mt-3.5">
                <SkeletonList rows={3} />
              </View>
            ) : topAlerts.length === 0 ? (
              <View className="web:desktop:mt-3.5">
                <EmptyState icon="✅" message={t('alerts.empty')} compact />
              </View>
            ) : (
              <View className="web:desktop:mt-3.5 web:desktop:gap-2.5">
                {topAlerts.map((alert) => (
                  <Pressable
                    key={alert.id}
                    onPress={() => router.push(alert.actionRoute)}
                    accessibilityRole="button"
                    className={`web:desktop:flex-row web:desktop:gap-2.5 web:desktop:rounded-row web:desktop:border-e-[3px] web:desktop:bg-surface-light web:desktop:p-3.5 dark:web:desktop:bg-surface-dark ${
                      alert.severity === 'critical'
                        ? 'web:desktop:border-danger-light dark:web:desktop:border-danger-dark'
                        : alert.severity === 'warning'
                          ? 'web:desktop:border-warning-light dark:web:desktop:border-warning-dark'
                          : 'web:desktop:border-border-light dark:web:desktop:border-border-dark'
                    }`}
                  >
                    <Ionicons
                      name={severityIconName(alert.severity)}
                      size={ICON.row}
                      color={severityColorToken(alert.severity, scheme === 'dark' ? 'dark' : 'light')}
                    />
                    <View className="web:desktop:flex-1">
                      <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {alert.title}
                      </Text>
                      <Text className="web:desktop:mt-0.5 text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={2}>
                        {alert.description}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>

        <View className="web:desktop:w-[280px] web:desktop:flex-none">
          <View className={`web:desktop:h-full ${DESKTOP_CARD_CLASS}`}>
            <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
              <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('dashboard.recentTitle')}
              </Text>
              {recentTransactions.length > 0 && (
                <Pressable onPress={() => router.push('/transactions')} accessibilityRole="button">
                  <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                    {t('alerts.viewAll')}
                  </Text>
                </Pressable>
              )}
            </View>
            {transactionsError ? (
              <View className="web:desktop:mt-3.5">
                <ErrorMessage message={t('dashboard.errors.generic')} />
              </View>
            ) : isTransactionsLoading ? (
              <View className="web:desktop:mt-3.5">
                <SkeletonList rows={3} />
              </View>
            ) : recentTransactions.length === 0 ? (
              <View className="web:desktop:mt-3.5">
                <EmptyState iconName="receipt-outline" message={t('dashboard.noTransactions')} compact />
              </View>
            ) : (
              <View className="web:desktop:mt-3.5 web:desktop:gap-3">
                {recentTransactions.map((txn) => {
                  const categoryName = txn.category_id ? categoryNameById[txn.category_id] : undefined
                  return (
                    <Pressable
                      key={txn.id}
                      onPress={() => router.push(`/transactions/${txn.id}`)}
                      accessibilityRole="button"
                      className="web:desktop:flex-row web:desktop:items-center web:desktop:gap-2.5"
                    >
                      <CategoryIcon icon={txn.category_id ? categoryIconById[txn.category_id] : undefined} size="sm" />
                      <View className="web:desktop:flex-1">
                        <Text className="text-body font-sansMedium text-ink-light dark:text-ink-dark" numberOfLines={1}>
                          {txn.description}
                        </Text>
                        {categoryName && (
                          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                            {categoryName}
                          </Text>
                        )}
                      </View>
                      <Money agorot={txn.amount_agorot} size="caption" tone={txn.amount_agorot > 0 ? 'positive' : 'default'} />
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        </View>
      </View>
    </Screen>
  )
}
