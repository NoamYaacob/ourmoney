// Direction D (design-review artifact, approved across three refinement
// rounds — this checkpoint is its production implementation for tabletLg
// (1024) and desktop (1200+; the approved artifact's own "1440" tier —
// this app's `desktop` Tailwind screen starts at 1200, see
// tailwind.config.js). One continuous financial story, not a grid of
// panels:
//
//   1. פנוי באמת hero, and מה יקרה עד אז — the SAME panel's own connected
//      staircase timeline (FinancialTimelineChart), not a separate "מה
//      מגיע" card beside it. The hero's own horizon selector (week/month/
//      30 ימים) and its always-visible waterfall legend are a real,
//      separately-approved desktop feature predating this checkpoint and
//      are unchanged — only what used to sit to the hero's *side* moved
//      *into* it, replacing the old `CommitmentTimeline` + commitment-row
//      list.
//   2. מה דורש תשומת לב — every real alert, 3-up from tabletLg.
//   3. לאן אנחנו מתקדמים — savings-goal progress, new to this screen.
//
// No fixed Budget Pace panel and no Recent Transactions panel on Home
// (explicit product decision, carried from the approved design) — budget
// stays fully reachable at /budgets, recent activity at /transactions.
// `CommitmentRow`/`useUpcomingCommitments` are untouched and keep every
// other existing caller (Cash Flow, Installments, More); only Home stops
// using the commitments-list card.
//
// Renders at >=1024px on web (app/(app)/dashboard/index.tsx picks between
// this and MobileHome, at TABLET_LG_BREAKPOINT_PX — see that file's own
// comment). `web:tabletLg:` classes are this composition's tabletLg (1024)
// treatment; `web:desktop:` overrides are desktop (1200+) only.

import { useState } from 'react'
import { Pressable, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { useFinancialAlerts } from '@/features/alerts/hooks/useFinancialAlerts'
import { useSavingsGoals } from '@/features/savings/hooks/useSavingsGoals'
import { useAccountBalances } from '@/features/accounts/hooks/useAccountBalances'
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'
import { getCurrentMonthPeriodStart } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'
import { FinancialTimelineChart, FinancialTimelineLowBadge, type FinancialTimelineChartVariant } from '@/features/dashboard/components/FinancialTimeline'
import { AttentionSection } from '@/features/dashboard/components/AttentionSection'
import { HomeGoalsSection } from '@/features/dashboard/components/HomeGoalsSection'
import { MobileAnalyticsSection } from '@/features/dashboard/components/MobileAnalyticsSection'
import { Screen } from '@/components/ui/Screen'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { HeroPanel, HeroLabel, HeroNote, HeroTag, HeroLegendRow } from '@/components/ui/HeroPanel'
import { Money } from '@/components/ui/Money'
import { colors } from '@/constants/colors'
import { RESPONSIVE_PANEL_CLASS, DESKTOP_BREAKPOINT_PX } from '@/constants/layout'

const CASH_FLOW_TIMELINE_HORIZON_DAYS = 30

const HORIZON_ORDER: HorizonKind[] = ['week', 'month', 'days30']
const HORIZON_PILL_KEY: Record<HorizonKind, string> = {
  week: 'dashboard.hero.horizonWeek',
  month: 'dashboard.hero.horizonMonth',
  days30: 'dashboard.hero.horizonDays30',
}

export function DesktopDashboard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  // 1024 (tabletLg) and 1200+ (desktop, this app's own `web:desktop:`
  // breakpoint — the approved artifact's "1440" tier) get their own chart
  // plot sizing, not one chart scaled to fit — round-3 refinement's own
  // explicit "1440 no longer carries more height than it needs" finding.
  const { width } = useWindowDimensions()
  const timelineVariant: FinancialTimelineChartVariant = width >= DESKTOP_BREAKPOINT_PX ? 'desktop' : 'tabletLg'

  // Matches the mockup's own שבוע/חודש/30 ימים toggle on the hero —
  // useSafeToSpend already accepts any of the three HorizonKind values.
  const [horizon, setHorizon] = useState<HorizonKind>('month')
  const {
    result: safeToSpend,
    isLoading: isSafeToSpendLoading,
    error: safeToSpendError,
    hasData: hasSafeToSpendData,
    refetch: refetchSafeToSpend,
  } = useSafeToSpend(householdId, horizon)
  // The timeline always tells the 30-day story regardless of which hero
  // horizon pill is selected — same reasoning the approved design gives for
  // the Safe-to-Spend-matching-point marker needing a stable reference: the
  // "what happens between today and the answer" story does not reset just
  // because the headline figure's own window changed.
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

  const [showAnalytics, setShowAnalytics] = useState(true)
  const periodStart = getCurrentMonthPeriodStart()

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

  const hasShortfall = safeToSpend.safeToSpendAgorot < 0

  return (
    <Screen
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      {/* The screen title, month stepper, search field and primary action
          that used to sit here are now the shell's DesktopTopBar
          (components/ui/DesktopTopBar.tsx). */}

      {/* 1 — פנוי באמת hero, and מה יקרה עד אז in the same panel: the
          number is the conclusion, the timeline is why. */}
      <HeroPanel>
        <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
          <HeroLabel>{t('dashboard.hero.label')}</HeroLabel>
          <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-1.5">
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
                the figures below are real, last-known-good data. */}
            {safeToSpendError && (
              <View className="mt-2">
                <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchSafeToSpend} />
              </View>
            )}
            <View className="mt-2">
              <Money
                agorot={hasShortfall ? safeToSpend.shortfallAgorot : safeToSpend.safeToSpendAgorot}
                size="heroXl"
                tone="hero"
              />
            </View>
            <View className="web:tabletLg:mt-2.5 web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-2.5">
              <HeroTag>{hasShortfall ? t('home.hero.shortfallTag') : t('dashboard.hero.notBankBalance')}</HeroTag>
              {!hasShortfall && safeToSpend.safeToSpendAgorot > 0 && (
                <HeroNote>
                  {t('dashboard.hero.perDay', { amount: formatILS(Math.round(safeToSpend.safeToSpendAgorot / 30)) })}
                </HeroNote>
              )}
            </View>
            {hasShortfall && <HeroNote className="mt-2">{t('home.hero.shortfallNote')}</HeroNote>}

            <View className="web:tabletLg:mt-5 web:tabletLg:h-9 web:tabletLg:flex-row web:tabletLg:gap-0.5 web:tabletLg:overflow-hidden web:tabletLg:rounded-control">
              <View className="web:tabletLg:bg-accent-light dark:web:tabletLg:bg-accent-dark" style={{ flexGrow: Math.max(1, safeToSpend.availableCashAgorot) }} />
              <View className="web:tabletLg:bg-heroBorder-light" style={{ flexGrow: Math.max(1, safeToSpend.plannedObligationsAgorot) }} />
              <View className="web:tabletLg:bg-hero-dark" style={{ flexGrow: Math.max(1, safeToSpend.recurringAgorot) }} />
            </View>

            {/* The waterfall legend, in the mockup's own order: the answer
                first, then each thing subtracted from the balance, then
                the balance itself as the closing total. */}
            <View className="web:tabletLg:mt-4 web:tabletLg:gap-2.5">
              <HeroLegendRow label={t('cashFlow.safeToSpend')} swatchColor={colors.accent.light} emphasis>
                <Money agorot={safeToSpend.safeToSpendAgorot} size="caption" tone="hero" />
              </HeroLegendRow>
              <HeroLegendRow label={t('cashFlow.plannedObligations')} swatchColor={colors.heroBorder.light}>
                <Money agorot={safeToSpend.plannedObligationsAgorot} size="caption" tone="heroMuted" />
              </HeroLegendRow>
              <HeroLegendRow label={t('cashFlow.recurringCharges')} swatchColor={colors.inkMuted.light}>
                <Money agorot={safeToSpend.recurringAgorot} size="caption" tone="heroMuted" />
              </HeroLegendRow>
              <View className="web:tabletLg:h-px web:tabletLg:bg-heroBorder-light" />
              <HeroLegendRow label={t('cashFlow.availableCash')} emphasis>
                <Money agorot={safeToSpend.availableCashAgorot} size="caption" tone="hero" />
              </HeroLegendRow>
            </View>
          </>
        )}

        {/* מה יקרה עד אז — a hairline, not a card boundary, keeps this
            reading as one panel per the approved design's own §3
            refinement. Tablet (1024) gets its own plot sizing, not a
            scaled-down desktop chart — that is exactly what `variant`
            below selects. */}
        <View className="web:tabletLg:mt-5 web:tabletLg:border-t web:tabletLg:border-white/[0.07] web:tabletLg:pt-4">
          <View className="mb-3 web:tabletLg:flex-row web:tabletLg:items-baseline web:tabletLg:justify-between">
            <Text className="text-caption font-heeboBold text-heroInkMuted-light">{t('home.timeline.title')}</Text>
            {hasForecastData && <FinancialTimelineLowBadge forecast={forecast} />}
          </View>
          {isForecastLoading ? (
            <SkeletonList rows={3} />
          ) : !hasForecastData ? (
            <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchForecast} />
          ) : (
            <FinancialTimelineChart
              forecast={forecast}
              safeToSpendAgorot={hasSafeToSpendData ? safeToSpend.safeToSpendAgorot : null}
              variant={timelineVariant}
            />
          )}
        </View>
      </HeroPanel>

      {/* 2 — מה דורש תשומת לב, 3-up from tabletLg. */}
      <View className={`web:tabletLg:mt-5 ${RESPONSIVE_PANEL_CLASS}`}>
        <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:tabletLg:text-[18px]">
            {t('home.attention.title')}
          </Text>
          {alerts.length > 0 && (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('home.attention.count', { count: alerts.length })}
            </Text>
          )}
        </View>
        <View className="web:tabletLg:mt-3.5">
          {isAlertsLoading ? <SkeletonList rows={3} /> : <AttentionSection alerts={alerts} />}
        </View>
      </View>

      {/* 3 — לאן אנחנו מתקדמים. New to this screen. */}
      <View className={`web:tabletLg:mt-5 ${RESPONSIVE_PANEL_CLASS}`}>
        <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:tabletLg:text-[18px]">
            {t('home.goals.title')}
          </Text>
          {goals.length > 0 && (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('home.goals.count', { count: goals.length })}
            </Text>
          )}
        </View>
        <View className="web:tabletLg:mt-3.5">
          {isGoalsLoading ? (
            <SkeletonList rows={3} />
          ) : !hasGoalsData ? (
            <ErrorMessage message={t('savings.errors.generic')} onRetry={refetchGoals} />
          ) : (
            <HomeGoalsSection goals={goals} balances={balances} />
          )}
        </View>
      </View>

      {/* Analytics — open by default on tabletLg+ (real estate this screen
          already has plenty of), same underlying data/component MobileHome
          uses behind its own closed-by-default disclosure. */}
      <View className={`web:tabletLg:mt-5 ${RESPONSIVE_PANEL_CLASS}`}>
        <Pressable
          onPress={() => setShowAnalytics((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAnalytics }}
          className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between"
        >
          <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:tabletLg:text-[18px]">
            {t('home.analytics.toggle')}
          </Text>
          <Ionicons
            name={showAnalytics ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={isDark ? colors.inkMuted.dark : colors.inkMuted.light}
          />
        </Pressable>
        {showAnalytics && (
          <View className="web:tabletLg:mt-4">
            <MobileAnalyticsSection householdId={householdId} periodStart={periodStart} />
          </View>
        )}
      </View>
    </Screen>
  )
}
