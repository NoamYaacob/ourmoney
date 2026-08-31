// Screen 01 of the mobile design — the app's front door.
//
// Living Money Home (CP8C — replaces the Direction D composition's own
// FinancialTimeline visualization with the CP8B Money Journey component,
// approved and locked in independent production review): one continuous
// financial story, not a grid of cards.
//
//   1. NOW — פנוי באמת, on the dark hero panel, as the only figure at hero
//      size.
//   2. WHY — the ProtectedFreeBoundary (CP8A) directly beneath it, still in
//      the same panel.
//   3. WHAT CHANGED — Financial Pulse (CP8E): a compact, self-guarding
//      narrative bridge comparing NOW against the last snapshot this
//      household member successfully saw. Renders nothing on a first
//      visit or when nothing truthfully changed — never a permanent empty
//      container, never a fabricated "no change."
//   4. WHAT WILL HAPPEN — the same panel's own connected Money Journey:
//      today's balance -> each real upcoming event's own BEFORE -> EVENT ±
//      DELTA -> AFTER -> ... -> the 30-day low point. A native vertical
//      journey on this breakpoint (MoneyJourney's own `mobile` variant),
//      not a shrunk desktop chart.
//   5. WHAT NEEDS ACTION — מה דורש תשומת לב, every real financial alert,
//      not just the one critical one this screen used to show.
//   6. PROGRESS — לאן אנחנו מתקדמים, savings-goal progress, using only
//      engine-truthful pace language.
//
// Hero, boundary, pulse and journey are deliberately ONE HeroPanel with
// hairline (not card-boundary) dividers between them — not four stacked
// widgets — so the panel reads as one connected canvas: what's available
// now, what's already protected, what changed, what happens to the money
// next.
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
//
// A brand-new household with zero accounts is a distinct, earlier state
// than any of the above — see the `hasNoAccounts` branch below, which
// collapses the whole screen to one restrained onboarding message and a
// single "add your first account" CTA, per the approved design. That is
// not the same thing as "has accounts but no goals/alerts/events yet",
// which keeps its own real per-section empty states.

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
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { getCurrentMonthPeriodStart, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'
import { greetingKey } from '@/features/dashboard/lib/commitmentUrgency'
import { MobileAnalyticsSection } from '@/features/dashboard/components/MobileAnalyticsSection'
import { MoneyJourney, MoneyJourneyLowBadge } from '@/features/cashflow/components/MoneyJourney'
import { useFinancialPulse } from '@/features/pulse/hooks/useFinancialPulse'
import { FinancialPulseCard } from '@/features/pulse/components/FinancialPulseCard'
import { AttentionSection } from '@/features/dashboard/components/AttentionSection'
import { HomeGoalsSection } from '@/features/dashboard/components/HomeGoalsSection'
import { Screen } from '@/components/ui/Screen'
import { FAB } from '@/components/ui/FAB'
import { Avatar } from '@/components/ui/Avatar'
import { Money } from '@/components/ui/Money'
import { HeroPanel, HeroLabel, HeroNote, HeroTag } from '@/components/ui/HeroPanel'
import { ProtectedFreeBoundary } from '@/components/ui/ProtectedFreeBoundary'
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
  const { accounts, hasData: hasAccountsData } = useAccounts(householdId)

  // CP8E — Financial Pulse. Composed from the SAME safeToSpend result the
  // hero above already rendered (never a second, divergent read), so
  // whatever Pulse claims changed is guaranteed consistent with the figure
  // the user is looking at. Called unconditionally, alongside every other
  // hook above, even though the JSX for the true zero-account state below
  // never renders FinancialPulseCard — see that branch's own comment.
  const { pulse } = useFinancialPulse(householdId, user?.id, {
    hasData: hasSafeToSpendData,
    safeToSpendAgorot: safeToSpend.safeToSpendAgorot,
  })

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

  // The true zero-account state — a brand-new household with nothing
  // connected yet — is not "every figure happens to be ₪0", it is "there is
  // nothing to calculate from". Showing the full composition here would mean
  // a calculated-looking ₪0.00 hero next to three more empty-state cards
  // begging for input; the approved design instead collapses the whole
  // screen to one message and one CTA. This does NOT cover "has accounts but
  // nothing else yet" (no goals, no upcoming events, no alerts) — those keep
  // their own real per-section empty states below, unchanged.
  const hasNoAccounts = hasAccountsData && accounts.length === 0

  if (hasNoAccounts) {
    return (
      <Screen width="wide">
        <View className="mb-4 flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{greeting}</Text>
            {household && (
              <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{household.name}</Text>
            )}
          </View>
          <Avatar displayName={displayName ?? ''} avatarUrl={avatarUrl} size={38} />
        </View>

        <HeroPanel>
          <Text className="text-body font-heeboBold text-heroInk-light">{t('home.hero.noDataTitle')}</Text>
          <HeroNote className="mt-2">{t('home.hero.noDataBody')}</HeroNote>
          <Pressable
            testID="home-no-data-cta"
            onPress={() => router.push('/accounts?add=checking')}
            accessibilityRole="button"
            className="mt-4 self-start rounded-control bg-heroAccent-light px-4 py-2.5 active:opacity-90"
          >
            <Text className="text-caption font-heeboBold text-hero-light">{t('home.hero.noDataCta')}</Text>
          </Pressable>
          <HeroNote className="mt-3">{t('home.hero.noDataPreview')}</HeroNote>
        </HeroPanel>
      </Screen>
    )
  }

  const hasShortfall = safeToSpend.safeToSpendAgorot < 0
  // Days left in the horizon, inclusive of today — a household spending the
  // "per day" figure every remaining day lands exactly on zero.
  const today = localDateString()
  const daysLeft = Math.max(1, Math.round((Date.parse(horizon.end) - Date.parse(today)) / 86_400_000) + 1)
  const perDayAgorot = hasShortfall ? 0 : Math.floor(safeToSpend.safeToSpendAgorot / daysLeft)

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

              {/* The protected/free boundary — the approved Living Money
                  treatment (CP8A), replacing the old free-first 3-segment
                  bar. */}
              {!hasShortfall && safeToSpend.availableCashAgorot > 0 && (
                <View className="mt-4">
                  <ProtectedFreeBoundary
                    protectedAgorot={safeToSpend.reservedAgorot}
                    freeAgorot={safeToSpend.safeToSpendAgorot}
                    totalAgorot={safeToSpend.availableCashAgorot}
                  />
                </View>
              )}
            </>
          )}
        </Pressable>

        {/* WHAT CHANGED — Financial Pulse (CP8E). A compact narrative
            bridge, in the SAME panel, between the hero above and the Money
            Journey below — not a sixth disconnected card. Self-guards on
            no comparison being available (first visit) or nothing having
            truthfully changed — renders nothing in either case, never a
            permanent empty container. */}
        <FinancialPulseCard pulse={pulse} />

        {/* WHAT WILL HAPPEN — the Money Journey. A hairline, not a card
            boundary, keeps this reading as one panel with the hero/boundary
            above it, not a separate widget. */}
        <View className="mt-2 border-t border-white/[0.07] pt-2">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-caption font-heeboBold text-heroInkMuted-light">{t('home.timeline.title')}</Text>
            {hasForecastData && <MoneyJourneyLowBadge forecast={forecast} />}
          </View>
          {isForecastLoading ? (
            <SkeletonList rows={2} />
          ) : !hasForecastData ? (
            <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchForecast} />
          ) : (
            <MoneyJourney
              forecast={forecast}
              safeToSpendAgorot={hasSafeToSpendData ? safeToSpend.safeToSpendAgorot : null}
              variant="mobile"
              compactDefault
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
          // RRR §16 P0-4: see SegmentedControl.tsx's note.
          aria-expanded={showAnalytics}
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
