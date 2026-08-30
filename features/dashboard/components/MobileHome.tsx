// Screen 01 of the mobile design — the app's front door.
//
// Direction D (design-review artifact, approved across three refinement
// rounds — this checkpoint is its production implementation): one
// continuous financial story, not a grid of cards.
//
//   1. פנוי באמת, on the dark hero panel, as the only figure at hero size.
//   2. מה יקרה עד אז — the same panel's own connected timeline: today's
//      balance -> each real upcoming event -> the resulting balance ->
//      ... -> the 30-day low point. A native vertical list on this
//      breakpoint (FinancialTimelineList), not a shrunk desktop chart.
//   3. מה דורש תשומת לב — every real financial alert, not just the one
//      critical one this screen used to show.
//   4. לאן אנחנו מתקדמים — savings-goal progress, new to Home.
//
// No fixed Budget Pace card and no Recent Transactions card on Home
// (explicit product decision, carried from the approved design) — budget
// stays fully reachable at /budgets, recent activity at /transactions.
// Everything else the desktop dashboard shows beyond these four —
// the six-month trend, the category donut — sits behind the analytics
// disclosure at the bottom, same as before this pass.
//
// This is a sibling of the desktop dashboard, not a narrowed copy of it:
// app/(app)/dashboard/index.tsx picks between the two by width. That split
// is what lets the desktop composition own its own tabletLg/desktop
// treatment while this one is structured for a thumb.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useProfile } from '@/features/auth/hooks/useProfile'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import { getCurrentMonthPeriodStart, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'
import { greetingKey } from '@/features/dashboard/lib/commitmentUrgency'
import { MobileAnalyticsSection } from '@/features/dashboard/components/MobileAnalyticsSection'
import { FinancialTimelineList, FinancialTimelineLowBadge } from '@/features/dashboard/components/FinancialTimeline'
import { AttentionSection } from '@/features/dashboard/components/AttentionSection'
import { HomeGoalsSection } from '@/features/dashboard/components/HomeGoalsSection'
import { Screen } from '@/components/ui/Screen'
import { FAB } from '@/components/ui/FAB'
import { Avatar } from '@/components/ui/Avatar'
import { Money } from '@/components/ui/Money'
import { HeroPanel, HeroLabel, HeroNote, HeroTag } from '@/components/ui/HeroPanel'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

const CASH_FLOW_TIMELINE_HORIZON_DAYS = 30

export function MobileHome() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const { user } = useAuth()
  const { displayName, avatarUrl } = useProfile(user?.id)
  const { householdId, household, isLoading: isHouseholdLoading } = useHousehold(user?.id)

  const {
    result: safeToSpend,
    horizon,
    isLoading: isSafeToSpendLoading,
    error: safeToSpendError,
    hasData: hasSafeToSpendData,
    refetch: refetchSafeToSpend,
  } = useSafeToSpend(householdId, 'month')
  const {
    result: forecast,
    isLoading: isForecastLoading,
    hasData: hasForecastData,
    refetch: refetchForecast,
  } = useCashFlowForecast(householdId, CASH_FLOW_TIMELINE_HORIZON_DAYS)
  const { alerts, isLoading: isAlertsLoading } = useFinancialAlerts(householdId)
  const {
    goals,
    isLoading: isGoalsLoading,
    hasData: hasGoalsData,
    refetch: refetchGoals,
  } = useSavingsGoals(householdId)
  const { balances } = useAccountBalances(householdId)

  const periodStart = getCurrentMonthPeriodStart()

  // Analytics, closed by default. See MobileAnalyticsSection's header for
  // why this is a disclosure rather than a fifth block or a screen of its
  // own.
  const [showAnalytics, setShowAnalytics] = useState(false)

  // Fail-safe display, the same gate every other screen in this app uses:
  // while the household query is in flight every downstream hook is
  // disabled, so rendering now would show a fully-loaded-looking ₪0.00 that
  // a household with no money could not tell apart from the truth.
  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  const greeting = t(`home.greeting.${greetingKey(new Date().getHours())}`, { name: displayName ?? '' })
  const alertCount = alerts.filter((alert) => alert.severity !== 'info').length

  const hasShortfall = safeToSpend.safeToSpendAgorot < 0
  // Days left in the horizon, inclusive of today — a household spending the
  // "per day" figure every remaining day lands exactly on zero.
  const today = localDateString()
  const daysLeft = Math.max(1, Math.round((Date.parse(horizon.end) - Date.parse(today)) / 86_400_000) + 1)
  const perDayAgorot = hasShortfall ? 0 : Math.floor(safeToSpend.safeToSpendAgorot / daysLeft)

  // The composition bar: how the money that exists right now divides into
  // free / committed-to-obligations / committed-to-recurring-and-instalments.
  // Percentages of availableCash, so the three segments read as slices of
  // one real quantity rather than an abstract 100%.
  const cash = Math.max(1, safeToSpend.availableCashAgorot)
  const freePercent = Math.max(0, (Math.max(0, safeToSpend.safeToSpendAgorot) / cash) * 100)
  const obligationsPercent = Math.min(100 - freePercent, (safeToSpend.plannedObligationsAgorot / cash) * 100)
  const recurringPercent = Math.max(0, 100 - freePercent - obligationsPercent)

  return (
    <Screen
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      {/* Header. The two top corners carry only navigation, never a primary
          action — the design's own hand-reach rule; the one thing a
          household does often (add a transaction) is the FAB down by the
          thumb instead. */}
      <View className="mb-4 flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{greeting}</Text>
          {household && (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{household.name}</Text>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push('/alerts')}
            accessibilityRole="button"
            accessibilityLabel={t('alerts.screenTitle')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="notifications-outline" size={23} color={isDark ? colors.ink.dark : colors.ink.light} />
            {alertCount > 0 && (
              <View
                className="absolute end-1.5 top-1 min-w-[17px] items-center justify-center rounded-full px-1"
                style={{ height: 17, backgroundColor: isDark ? colors.danger.dark : colors.danger.light }}
              >
                <Text
                  className="font-heeboBold text-meta"
                  style={{ color: isDark ? colors.hero.light : '#ffffff' }}
                  maxFontSizeMultiplier={1.2}
                >
                  {alertCount}
                </Text>
              </View>
            )}
          </Pressable>
          <Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={38} />
        </View>
      </View>

      {/* 1 — פנוי באמת, and 2 — מה יקרה עד אז, in the same hero panel: the
          number is the conclusion, the timeline is why — one story, not a
          KPI card followed by a separate chart card. */}
      <HeroPanel>
        <Pressable
          testID="home-hero"
          onPress={() => router.push('/safe-to-spend')}
          accessibilityRole="button"
          accessibilityLabel={t('safeToSpendDetail.title')}
        >
          <HeroLabel>{t('home.hero.label', { horizon: t('cashFlow.horizon.month') })}</HeroLabel>

          {isSafeToSpendLoading ? (
            <View className="mt-2">
              <SkeletonList rows={1} />
            </View>
          ) : !hasSafeToSpendData ? (
            <View className="mt-2">
              <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchSafeToSpend} />
            </View>
          ) : (
            <>
              {/* A background refetch failing after a previous success must
                  not blank the hero — `hasSafeToSpendData` already confirmed
                  `safeToSpend` below is real, last-known-good data. Surface
                  the failure as a small non-blocking banner instead. */}
              {safeToSpendError && (
                <View className="mt-2">
                  <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchSafeToSpend} />
                </View>
              )}
              <View className="mt-1.5">
                <Money
                  agorot={hasShortfall ? safeToSpend.shortfallAgorot : safeToSpend.safeToSpendAgorot}
                  size="hero"
                  tone="hero"
                />
              </View>
              <View className="mt-1 flex-row items-center gap-2">
                <HeroTag>{hasShortfall ? t('home.hero.shortfallTag') : t('home.hero.notBankBalance')}</HeroTag>
                {!hasShortfall && perDayAgorot > 0 && (
                  <HeroNote>{t('home.hero.perDay', { amount: formatILS(perDayAgorot) })}</HeroNote>
                )}
              </View>
              {hasShortfall && <HeroNote className="mt-2">{t('home.hero.shortfallNote')}</HeroNote>}

              {/* The composition bar. Three segments, no legend: the panel's
                  own numbers name them, and a legend on a 4-line hero is more
                  to read than the bar saves. */}
              {!hasShortfall && safeToSpend.availableCashAgorot > 0 && (
                <View
                  className="mt-4 h-2.5 flex-row gap-0.5 overflow-hidden rounded-full"
                  accessibilityLabel={t('home.hero.compositionLabel', {
                    amount: formatILS(safeToSpend.availableCashAgorot),
                    safe: formatILS(safeToSpend.safeToSpendAgorot),
                  })}
                >
                  <View style={{ width: `${freePercent}%`, backgroundColor: colors.accent.light }} />
                  <View style={{ width: `${obligationsPercent}%`, backgroundColor: colors.heroBorder.light }} />
                  <View style={{ width: `${recurringPercent}%`, backgroundColor: colors.inkMuted.light }} />
                </View>
              )}
            </>
          )}
        </Pressable>

        {/* The timeline: a hairline, not a card boundary, keeps this
            reading as one panel per the approved design's own §3
            refinement. */}
        <View className="mt-2 border-t border-white/[0.07] pt-2">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-caption font-heeboBold text-heroInkMuted-light">{t('home.timeline.title')}</Text>
            {hasForecastData && <FinancialTimelineLowBadge forecast={forecast} />}
          </View>
          {isForecastLoading ? (
            <SkeletonList rows={2} />
          ) : !hasForecastData ? (
            <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchForecast} />
          ) : (
            <FinancialTimelineList
              forecast={forecast}
              safeToSpendAgorot={hasSafeToSpendData ? safeToSpend.safeToSpendAgorot : null}
            />
          )}
        </View>
      </HeroPanel>

      {/* 3 — מה דורש תשומת לב. Every real alert, not just the top critical
          one this screen used to show — same severity-sorted list /alerts
          renders in full. */}
      <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark">
        <View className="flex-row items-center justify-between px-4 pt-3.5">
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark">{t('home.attention.title')}</Text>
          {alerts.length > 0 && (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('home.attention.count', { count: alerts.length })}
            </Text>
          )}
        </View>
        {isAlertsLoading ? (
          <View className="p-4">
            <SkeletonList rows={2} />
          </View>
        ) : (
          <AttentionSection alerts={alerts} />
        )}
      </View>

      {/* 4 — לאן אנחנו מתקדמים. New to Home. */}
      <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark">
        <View className="flex-row items-center justify-between px-4 pt-3.5">
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark">{t('home.goals.title')}</Text>
          {goals.length > 0 && (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('home.goals.count', { count: goals.length })}
            </Text>
          )}
        </View>
        {isGoalsLoading ? (
          <View className="p-4">
            <SkeletonList rows={2} />
          </View>
        ) : !hasGoalsData ? (
          <View className="p-4">
            <ErrorMessage message={t('savings.errors.generic')} onRetry={refetchGoals} />
          </View>
        ) : (
          <View className="pb-1 pt-2">
            <HomeGoalsSection goals={goals} balances={balances} />
          </View>
        )}
      </View>

      {/* Analytics, closed by default. See MobileAnalyticsSection's header
          for why this is a disclosure rather than a fifth block or a screen
          of its own. */}
      <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark">
        <Pressable
          onPress={() => setShowAnalytics((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAnalytics }}
          className="min-h-[52px] flex-row items-center justify-between px-4 py-3"
        >
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark">
            {t('home.analytics.toggle')}
          </Text>
          <Ionicons
            name={showAnalytics ? 'chevron-up' : 'chevron-down'}
            size={ICON.row}
            color={isDark ? colors.inkMuted.dark : colors.inkMuted.light}
          />
        </Pressable>
        {showAnalytics && (
          <View className="border-t border-divider-light px-4 py-4 dark:border-divider-dark">
            <MobileAnalyticsSection householdId={householdId} periodStart={periodStart} />
          </View>
        )}
      </View>

      <View className="h-4" />
    </Screen>
  )
}
