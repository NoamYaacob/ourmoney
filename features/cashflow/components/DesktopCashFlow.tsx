// Desktop Claude Design pass. Rebuilt to match the approved
// `OurMoney - Desktop.dc.html` Cash Flow screen: a one-sentence headline
// answer, a stats+chart evidence card, and the upcoming-events list that
// backs the headline's claim — the same "answer first, then evidence"
// composition MobileCashFlow.tsx already ships (Screen 06 of the mobile
// design), restyled for desktop's wider canvas instead of a second,
// divergent information architecture.
//
// The previous desktop composition additionally rendered a Safe-to-Spend
// breakdown (with its own week/month/30-day horizon toggle) and a unified
// "next 30 days" commitments list — content no mockup screen for Cash Flow
// ever specified, and which Dashboard's own hero (aggregate breakdown) and
// "מה מגיע" panel (itemized commitments) already cover. Dropped here, not
// duplicated, mirroring the same screen split mobile already made; the
// useSafeToSpend/useUpcomingCommitments hooks themselves are untouched and
// still load-bearing on Dashboard.
//
// One thing from the mockup is deliberately absent, matching mobile's own
// documented reasoning: its dark "מה יחזיר אותנו לירוק" panel, which
// proposes ranked ways to close a projected shortfall. No engine computes
// that, and CLAUDE.md is explicit that engines compute while nothing
// invents financial advice — hard-coding plausible-looking suggestions
// would be exactly the kind of fabricated figure that rule exists to
// prevent. Left out here for the same reason MobileCashFlow.tsx leaves it
// out, not a partial implementation of the mockup.
//
// Renders at >=1024px on web — app/(app)/cash-flow/index.tsx picks between
// this and MobileCashFlow, at TABLET_LG_BREAKPOINT_PX rather than
// DESKTOP_BREAKPOINT_PX (Checkpoint 5, same move Checkpoint 4 made for Home
// and Transactions — see that file's own comment). Every class below is
// `web:tabletLg:`-scoped for that reason, and the two SurfacePanels below
// became RESPONSIVE_PANEL_CLASS (SurfacePanel itself stays `web:desktop:`
// -only — Installments renders it unconditionally with no width switch of
// its own, so widening its scope would have restyled a screen this
// checkpoint never reviewed; see RESPONSIVE_PANEL_CLASS's own comment).
//
// Checkpoint 5 financial-hierarchy fix: the three balance figures
// (today/low-point/at-end) were equal-size `figure` numbers floating above
// the chart with no hierarchy of their own. Low point is now the one
// primary figure — it's literally what the answer sentence above it is
// about — sized `figure`; today (point-in-time) and at-end
// (end-of-period) are `large`, matching Money's own documented secondary
// role (components/ui/Money.tsx).
//
// Checkpoint 5: the trailing shortfall-status block this file used to
// render below the events list is gone — its three strings
// (shortfallWarningTitle/Body/Amount, or noShortfall) restated the exact
// date and amount the evidence panel's own intro sentence already states
// (cashFlow.mobile.answerShortfall/answerOk) word for word. In the
// shortfall case it was also a third bordered card, which is exactly the
// "summary card + chart card + status card" pattern the brief asks not to
// have — removing pure duplication, not cutting real content.

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { ForecastChart } from '@/features/cashflow/components/ForecastChart'
import type { CashFlowForecastEvent } from '@/lib/engines/cashflow/calculateCashFlowForecast'
import { causeOfLowPoint } from '@/features/cashflow/lib/lowPointCause'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Money } from '@/components/ui/Money'
import { StatusChip } from '@/components/ui/StatusChip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { RESPONSIVE_PANEL_CLASS } from '@/constants/layout'
import { useCashFlowStore } from '@/store/cashFlowStore'

function eventRoute(event: CashFlowForecastEvent): string {
  if (event.source === 'planned_obligation') return `/obligations/${event.sourceId}`
  if (event.source === 'installment_plan') return `/installments/${event.sourceId}`
  return `/recurring/${event.sourceId}`
}

export function DesktopCashFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  // Set from the shell header bar, where the mockup draws the selector.
  const days = useCashFlowStore((s) => s.horizonDays)
  const { result: forecast, isLoading, error, hasData, refetch } = useCashFlowForecast(householdId, Number(days))

  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  const hasShortfall = forecast.firstShortfallDate !== null
  const cause = causeOfLowPoint(forecast.events, forecast.lowestBalanceDate)

  return (
    <Screen width="richSingle">
      {/* No title and no horizon selector drawn here. The mockup's Cash Flow
          frame puts both in the 68px shell band — title at the start edge,
          30/60/90 pinned to the end — and DesktopTopBar owns that band for
          every desktop screen. Drawing them again titled the page twice.
          Checkpoint 5: `richSingle` (900 tablet / 960 desktop), not `wide`
          (1150 desktop) — SYSTEM.md §5/§1: a deliberate, generously-sized
          frame for the one object on this page (the evidence panel), not a
          wider canvas the chart still wouldn't have used on its own. */}
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : !hasData ? (
        <ErrorMessage message={t('cashFlow.forecast.errors.generic')} onRetry={refetch} />
      ) : (
        <>
          {/* A background refetch failing after a previous success must not
              blank the whole screen down to a bare error message — `hasData`
              already confirmed `forecast` below is real, last-known-good
              data (this was the root cause of Cash Flow "rendering almost
              totally blank, then just an error message" on the real
              preview: useCashFlowForecast's `error` is a union across six
              underlying queries, so any ONE background refetch failing —
              even after every horizon loaded fine — used to replace this
              entire screen). Surface the failure non-destructively instead. */}
          {error && (
            <View className="web:tabletLg:mb-4">
              <ErrorMessage message={t('cashFlow.forecast.errors.generic')} onRetry={refetch} />
            </View>
          )}
          {/* The evidence: the answer sentence, then the three headline
              figures, then the chart. Product-quality pass: the answer used
              to be its own full-width bordered card sitting above this one
              — a single sentence in a ~1150px box read as a mostly-empty
              banner, especially in the calm/positive case. Folded into this
              card's own intro row instead (icon + sentence, a divider below
              it before the stats) — one continuous "here's the answer, here's
              the evidence" card rather than two stacked boxes for what is
              really one narrative. The shortfall case keeps its own tinted
              strip (not the whole card) so it still reads as an alert
              without turning the entire evidence card red for what is
              otherwise routine chart content. */}
          <View className={`web:tabletLg:mt-4 ${RESPONSIVE_PANEL_CLASS}`}>
            <View
              className={`web:tabletLg:mb-5 web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-3 web:tabletLg:rounded-row web:tabletLg:border web:tabletLg:p-4 ${
                hasShortfall
                  ? 'web:tabletLg:bg-dangerSurface-light web:tabletLg:border-dangerBorder-light dark:web:tabletLg:bg-dangerSurface-dark dark:web:tabletLg:border-dangerBorder-dark'
                  : 'web:tabletLg:bg-surface-light web:tabletLg:border-border-light dark:web:tabletLg:bg-surface-dark dark:web:tabletLg:border-border-dark'
              }`}
            >
              <Ionicons
                name={hasShortfall ? 'alert-circle' : 'checkmark-circle'}
                size={ICON.row}
                color={hasShortfall ? (isDark ? colors.danger.dark : colors.danger.light) : isDark ? colors.positive.dark : colors.positive.light}
              />
              <Text className="web:tabletLg:flex-1 text-body font-sans text-ink-light dark:text-ink-dark web:tabletLg:text-[17px]">
                {hasShortfall
                  ? t('cashFlow.mobile.answerShortfall', {
                      date: formatDateDisplay(forecast.firstShortfallDate as string),
                      amount: formatILS(Math.abs(forecast.lowestBalanceAgorot)),
                    })
                  : t('cashFlow.mobile.answerOk', {
                      amount: formatILS(forecast.lowestBalanceAgorot),
                      date: formatDateDisplay(forecast.lowestBalanceDate),
                    })}
              </Text>
            </View>
            {/* Checkpoint 5 financial-hierarchy fix (design-review/SYSTEM.md
                §4/§8): three equal `figure`-size numbers read as "no
                hierarchy, only three loud numbers" (SYSTEM.md's own words).
                Low point is the one primary figure here — it's literally
                what the answer sentence above is about — so it alone keeps
                `figure`; today (point-in-time) and at-end (end-of-period)
                drop to `large`, Money's own documented secondary-metric
                size (components/ui/Money.tsx). */}
            <View className="web:tabletLg:flex-row web:tabletLg:items-start web:tabletLg:gap-9">
              <View>
                <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.today')}
                </Text>
                <Money agorot={forecast.startingBalanceAgorot} size="large" />
              </View>
              <View>
                <Text
                  className={`text-meta font-sansSemibold tracking-[0.08em] ${
                    forecast.lowestBalanceAgorot < 0
                      ? 'text-dangerStrong-light dark:text-dangerStrong-dark'
                      : 'text-inkMuted-light dark:text-inkMuted-dark'
                  }`}
                >
                  {t('cashFlow.mobile.lowPoint')}
                </Text>
                <Money agorot={forecast.lowestBalanceAgorot} size="figure" tone={forecast.lowestBalanceAgorot < 0 ? 'danger' : 'default'} />
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{formatDateDisplay(forecast.lowestBalanceDate)}</Text>
              </View>
              <View>
                <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.atEnd')}
                </Text>
                <Money agorot={forecast.endingBalanceAgorot} size="large" tone={forecast.endingBalanceAgorot < 0 ? 'danger' : 'default'} />
              </View>
            </View>

            <View className="web:tabletLg:mt-4">
              <ForecastChart
                variant="wide"
                dailyPoints={forecast.dailyPoints}
                lowestBalanceDate={forecast.lowestBalanceDate}
                events={forecast.events}
                chartSummary={`${t('cashFlow.mobile.today')}: ${formatILS(forecast.startingBalanceAgorot)}. ${t('cashFlow.mobile.lowPoint')}: ${formatILS(forecast.lowestBalanceAgorot)}, ${formatDateDisplay(forecast.lowestBalanceDate)}. ${t('cashFlow.mobile.atEnd')}: ${formatILS(forecast.endingBalanceAgorot)}.`}
              />
            </View>

            <Text className="web:tabletLg:mt-3 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('cashFlow.forecast.disclaimer')}
            </Text>
          </View>

          {/* The events that back the headline sentence — the cause of the
              low point is tagged inline, the same link mobile makes: a dip
              on a line is not actionable, "the car licence on the 4th is
              what does it" is.
              Checkpoint 5: heading demoted from a prominent 18px title to
              the same small-caps "meta" label style Transactions' sidebar
              headings use — this list backs the evidence panel above it, it
              is not a second primary section of equal weight (the brief:
              "should feel clearly secondary to the forecast itself"). */}
          <View className={`web:tabletLg:mt-4 ${RESPONSIVE_PANEL_CLASS}`}>
            <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
              <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('cashFlow.mobile.eventsTitle')}
              </Text>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('cashFlow.mobile.eventsCount', { count: forecast.events.length })}
              </Text>
            </View>

            {forecast.events.length === 0 ? (
              <Text className="web:tabletLg:mt-3 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('cashFlow.mobile.eventsEmpty')}
              </Text>
            ) : (
              <View className="web:tabletLg:mt-3">
                {forecast.events.map((event, index) => {
                  const isCause = cause?.id === event.id
                  const isInflow = event.direction === 'inflow'
                  return (
                    <Pressable
                      key={event.id}
                      onPress={() => router.push(eventRoute(event) as never)}
                      accessibilityRole="button"
                      accessibilityLabel={event.title}
                      // Second visual pass: this had no hover state at all —
                      // the same gap already fixed on every other desktop
                      // list row this pass (Accounts, Recurring, Goals,
                      // Settings, CommitmentRow). `-mx-3 px-3` unconditional
                      // now (was cause-only) so the fill has somewhere to
                      // sit on every row, not just the shortfall-cause one.
                      className={`web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-3 web:tabletLg:rounded-row web:tabletLg:-mx-3 web:tabletLg:px-3 web:tabletLg:py-2.5 web:hover:bg-surface-light/60 dark:web:hover:bg-surface-dark/40 ${
                        isCause ? 'web:tabletLg:bg-dangerSurface-light dark:web:tabletLg:bg-dangerSurface-dark' : ''
                      } ${index > 0 ? 'web:tabletLg:border-t web:tabletLg:border-divider-light dark:web:tabletLg:border-divider-dark' : ''}`}
                    >
                      <Text
                        className={`web:tabletLg:w-[52px] font-heeboBold text-caption ${
                          isInflow
                            ? 'text-positiveStrong-light dark:text-positiveStrong-dark'
                            : isCause
                              ? 'text-dangerStrong-light dark:text-dangerStrong-dark'
                              : 'text-inkMuted-light dark:text-inkMuted-dark'
                        }`}
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {formatDateDisplay(event.date).slice(0, 5)}
                      </Text>
                      <View className="web:tabletLg:flex-1">
                        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                          {event.title}
                        </Text>
                        {isCause ? (
                          <View className="web:tabletLg:mt-1">
                            <StatusChip label={hasShortfall ? t('cashFlow.mobile.causeTag') : t('cashFlow.mobile.causeTagLow')} tone="danger" />
                          </View>
                        ) : (
                          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                            {event.pastDue
                              ? t('cashFlow.forecast.pastDue')
                              : t(
                                  `cashFlow.commitments.source.${event.source === 'planned_obligation' ? 'obligation' : event.source === 'installment_plan' ? 'installment' : 'recurring'}`
                                )}
                          </Text>
                        )}
                      </View>
                      <Money agorot={isInflow ? event.amountAgorot : -event.amountAgorot} size="row" tone={isInflow ? 'positive' : 'default'} signed />
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  )
}
