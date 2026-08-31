// Living Money Home (CP8C — replaces the Direction D composition's own
// FinancialTimelineChart with the CP8B Money Journey component, approved and
// locked in independent production review) for tabletLg (1024) and desktop
// (1200+; this app's `desktop` Tailwind screen starts at 1200, see
// tailwind.config.js). One continuous financial story, not a grid of
// panels:
//
//   1. NOW/WHY — פנוי באמת hero with ProtectedFreeBoundary. The hero's own
//      horizon selector (week/month/30 ימים) and its always-visible
//      waterfall legend are a real, separately-approved desktop feature
//      predating this checkpoint and are unchanged.
//   2. WHAT CHANGED — Financial Pulse (CP8E), in the SAME panel: a compact,
//      self-guarding comparison against the last snapshot this member
//      successfully saw. Renders nothing on a first visit or when nothing
//      truthfully changed.
//   3. WHAT WILL HAPPEN — the SAME panel's own connected Money Journey
//      (MoneyJourney's `tabletLg`/`desktop` chart variant), not a separate
//      card beside it.
//   4. WHAT NEEDS ACTION — מה דורש תשומת לב, every real alert, 3-up from
//      tabletLg.
//   5. PROGRESS — לאן אנחנו מתקדמים, savings-goal progress, using only
//      engine-truthful pace language.
//
// Hero, boundary, pulse and journey are deliberately ONE HeroPanel — a
// connected canvas, not four stacked widgets.
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
//
// A brand-new household with zero accounts is a distinct, earlier state
// than any of the above — see the `hasNoAccounts` branch below, mirroring
// MobileHome.tsx's own.

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
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'
import { getCurrentMonthPeriodStart } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'
import { MoneyJourney, MoneyJourneyLowBadge, type MoneyJourneyVariant } from '@/features/cashflow/components/MoneyJourney'
import { useFinancialPulse } from '@/features/pulse/hooks/useFinancialPulse'
import { FinancialPulseCard } from '@/features/pulse/components/FinancialPulseCard'
import { AttentionSection } from '@/features/dashboard/components/AttentionSection'
import { HomeGoalsSection } from '@/features/dashboard/components/HomeGoalsSection'
import { MobileAnalyticsSection } from '@/features/dashboard/components/MobileAnalyticsSection'
import { Screen } from '@/components/ui/Screen'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { HeroPanel, HeroLabel, HeroNote, HeroTag, HeroLegendRow } from '@/components/ui/HeroPanel'
import { ProtectedFreeBoundary } from '@/components/ui/ProtectedFreeBoundary'
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
  const timelineVariant: MoneyJourneyVariant = width >= DESKTOP_BREAKPOINT_PX ? 'desktop' : 'tabletLg'

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
  const { accounts, hasData: hasAccountsData } = useAccounts(householdId)

  // CP8E — Financial Pulse. RRR §16 P0-3: deliberately NOT composed from
  // the `safeToSpend` result above — that one tracks the hero's own
  // user-selectable horizon pill, and the horizon toggle is presentation
  // state, not "which window Pulse compares." Feeding Pulse whatever
  // horizon the hero happened to be showing the instant this query
  // resolved let one household's baseline get permanently written from a
  // 'week' figure (reserves almost nothing) while the very next comparison
  // read against a 'month' figure (reserves rent/bills/obligations) — a
  // multi-thousand-shekel discrepancy reported as a real, causally-narrated
  // change. Pulse's own semantics ("the financial state this member last
  // successfully saw") require a single, stable window — always month,
  // matching MobileHome.tsx's own hardcoded 'month' (mobile has no horizon
  // toggle at all). TanStack Query dedupes this against the hero's own
  // call whenever horizon is already 'month' (same query key), so this is
  // a second subscription to the SAME cached result in the common case,
  // never a genuinely second network fetch.
  const { result: safeToSpendMonth, hasData: hasSafeToSpendMonthData } = useSafeToSpend(householdId, 'month')
  const { pulse } = useFinancialPulse(householdId, user?.id, {
    hasData: hasSafeToSpendMonthData,
    safeToSpendAgorot: safeToSpendMonth.safeToSpendAgorot,
  })

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

  // The true zero-account state — see MobileHome.tsx's identical branch for
  // the full reasoning. Collapses to one restrained message + one CTA
  // instead of a calculated-looking ₪0.00 hero next to three more empty
  // panels; does not cover "has accounts but no goals/alerts/events yet".
  const hasNoAccounts = hasAccountsData && accounts.length === 0

  if (hasNoAccounts) {
    return (
      <Screen width="wide">
        <HeroPanel>
          <Text className="text-body font-heeboBold text-heroInk-light web:tabletLg:text-[17px]">
            {t('home.hero.noDataTitle')}
          </Text>
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
          <View
            accessibilityRole="radiogroup"
            className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-1.5"
          >
            {/* RRR §16 P0-4: this pill group had NO accessibility state at
                all — role="button" with nothing marking which of the three
                mutually-exclusive horizons was selected. A single-choice
                pill group is exactly SegmentedControl.tsx's own pattern
                (role="radio" + aria-checked, its CP8D fix's precedent), so
                that's what this now matches, plus the accessibilityLabel
                every other Pressable in this file already gets. */}
            {HORIZON_ORDER.map((value) => (
              <Pressable
                key={value}
                onPress={() => setHorizon(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === horizon }}
                aria-checked={value === horizon}
                accessibilityLabel={t(HORIZON_PILL_KEY[value])}
              >
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

            {/* The protected/free boundary — the approved Living Money
                treatment (CP8A), replacing the old inline 3-segment bar
                (which weighted its first segment by `availableCashAgorot`,
                the whole pool, rather than by the free remainder — a
                display bug this component fixes, not just a re-skin).
                Guarded the same way MobileHome's own boundary is: a
                shortfall has no meaningful protected/free split to draw. */}
            {!hasShortfall && safeToSpend.availableCashAgorot > 0 && (
              <View className="web:tabletLg:mt-5">
                <ProtectedFreeBoundary
                  protectedAgorot={safeToSpend.reservedAgorot}
                  freeAgorot={safeToSpend.safeToSpendAgorot}
                  totalAgorot={safeToSpend.availableCashAgorot}
                  height={14}
                />
              </View>
            )}

            {/* The waterfall legend, in the mockup's own order: the answer
                first, then each thing subtracted from the balance, then
                the balance itself as the closing total. Instalments only
                render when the household has any — same "a group with
                nothing in it is not a zero to render" rule the
                /safe-to-spend receipt screen follows. */}
            <View className="web:tabletLg:mt-4 web:tabletLg:gap-2.5">
              <HeroLegendRow label={t('cashFlow.safeToSpend')} swatchColor={colors.heroAccent.light} emphasis>
                <Money agorot={safeToSpend.safeToSpendAgorot} size="caption" tone="hero" />
              </HeroLegendRow>
              <HeroLegendRow label={t('cashFlow.plannedObligations')} swatchColor={colors.heroBorder.light}>
                <Money agorot={safeToSpend.plannedObligationsAgorot} size="caption" tone="heroMuted" />
              </HeroLegendRow>
              <HeroLegendRow label={t('cashFlow.recurringCharges')} swatchColor={colors.heroBorder.light}>
                <Money agorot={safeToSpend.recurringAgorot} size="caption" tone="heroMuted" />
              </HeroLegendRow>
              {safeToSpend.installmentsAgorot > 0 && (
                <HeroLegendRow label={t('cashFlow.installmentCharges')} swatchColor={colors.heroBorder.light}>
                  <Money agorot={safeToSpend.installmentsAgorot} size="caption" tone="heroMuted" />
                </HeroLegendRow>
              )}
              <View className="web:tabletLg:h-px web:tabletLg:bg-heroBorder-light" />
              <HeroLegendRow label={t('cashFlow.availableCash')} emphasis>
                <Money agorot={safeToSpend.availableCashAgorot} size="caption" tone="hero" />
              </HeroLegendRow>
            </View>
          </>
        )}

        {/* WHAT CHANGED — Financial Pulse (CP8E), in the SAME panel between
            the hero and the Money Journey. Self-guards on no comparison
            being available or nothing having truthfully changed. */}
        <FinancialPulseCard
          pulse={pulse}
          className="web:tabletLg:mt-5 web:tabletLg:border-t web:tabletLg:border-white/[0.07] web:tabletLg:pt-4"
        />

        {/* WHAT WILL HAPPEN — the Money Journey. A hairline, not a card
            boundary, keeps this reading as one panel with the hero/boundary
            above it. Tablet (1024) gets its own plot sizing, not a
            scaled-down desktop chart — that is exactly what `variant`
            below selects. */}
        <View className="web:tabletLg:mt-5 web:tabletLg:border-t web:tabletLg:border-white/[0.07] web:tabletLg:pt-4">
          <View className="mb-3 web:tabletLg:flex-row web:tabletLg:items-baseline web:tabletLg:justify-between">
            <Text className="text-caption font-heeboBold text-heroInkMuted-light">{t('home.timeline.title')}</Text>
            {hasForecastData && <MoneyJourneyLowBadge forecast={forecast} />}
          </View>
          {isForecastLoading ? (
            <SkeletonList rows={3} />
          ) : !hasForecastData ? (
            <ErrorMessage message={t('cashFlow.errors.generic')} onRetry={refetchForecast} />
          ) : (
            <MoneyJourney
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
          // RRR §16 P0-4: see SegmentedControl.tsx's note.
          aria-expanded={showAnalytics}
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
