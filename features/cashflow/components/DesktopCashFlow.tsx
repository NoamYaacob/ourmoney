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
// Renders only at >=1200px on web — app/(app)/cash-flow/index.tsx picks
// between this and MobileCashFlow.

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
import { DESKTOP_CARD_CLASS } from '@/constants/layout'
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
    <Screen width="wide">
      {/* No title and no horizon selector drawn here. The mockup's Cash Flow
          frame puts both in the 68px shell band — title at the start edge,
          30/60/90 pinned to the end — and DesktopTopBar owns that band for
          every desktop screen. Drawing them again titled the page twice. */}
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
            <View className="web:desktop:mb-4">
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
          <View className={`web:desktop:mt-4 ${DESKTOP_CARD_CLASS}`}>
            <View
              className={`web:desktop:mb-5 web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-row web:desktop:border web:desktop:p-4 ${
                hasShortfall
                  ? 'web:desktop:bg-dangerSurface-light web:desktop:border-dangerBorder-light dark:web:desktop:bg-dangerSurface-dark dark:web:desktop:border-dangerBorder-dark'
                  : 'web:desktop:bg-surface-light web:desktop:border-border-light dark:web:desktop:bg-surface-dark dark:web:desktop:border-border-dark'
              }`}
            >
              <Ionicons
                name={hasShortfall ? 'alert-circle' : 'checkmark-circle'}
                size={ICON.row}
                color={hasShortfall ? (isDark ? colors.danger.dark : colors.danger.light) : isDark ? colors.positive.dark : colors.positive.light}
              />
              <Text className="web:desktop:flex-1 text-body font-sans text-ink-light dark:text-ink-dark web:desktop:text-[17px]">
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
            <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-9">
              <View>
                <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.today')}
                </Text>
                <Money agorot={forecast.startingBalanceAgorot} size="figure" />
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
                <Money agorot={forecast.endingBalanceAgorot} size="figure" tone={forecast.endingBalanceAgorot < 0 ? 'danger' : 'default'} />
              </View>
            </View>

            <View className="web:desktop:mt-4">
              <ForecastChart
                variant="wide"
                dailyPoints={forecast.dailyPoints}
                lowestBalanceDate={forecast.lowestBalanceDate}
                chartSummary={`${t('cashFlow.mobile.today')}: ${formatILS(forecast.startingBalanceAgorot)}. ${t('cashFlow.mobile.lowPoint')}: ${formatILS(forecast.lowestBalanceAgorot)}, ${formatDateDisplay(forecast.lowestBalanceDate)}. ${t('cashFlow.mobile.atEnd')}: ${formatILS(forecast.endingBalanceAgorot)}.`}
              />
            </View>

            <Text className="web:desktop:mt-3 text-caption text-inkMuted-light dark:text-inkMuted-dark">
              {t('cashFlow.forecast.disclaimer')}
            </Text>
          </View>

          {/* The events that back the headline sentence — the cause of the
              low point is tagged inline, the same link mobile makes: a dip
              on a line is not actionable, "the car licence on the 4th is
              what does it" is. */}
          <View className={`web:desktop:mt-4 ${DESKTOP_CARD_CLASS}`}>
            <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
              <Text className="text-heading font-heeboBold text-ink-light dark:text-ink-dark web:desktop:text-[18px]">
                {t('cashFlow.mobile.eventsTitle')}
              </Text>
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('cashFlow.mobile.eventsCount', { count: forecast.events.length })}
              </Text>
            </View>

            {forecast.events.length === 0 ? (
              <Text className="web:desktop:mt-3 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('cashFlow.mobile.eventsEmpty')}
              </Text>
            ) : (
              <View className="web:desktop:mt-3">
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
                      className={`web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-row web:desktop:-mx-3 web:desktop:px-3 web:desktop:py-2.5 web:hover:bg-surface-light/60 dark:web:hover:bg-surface-dark/40 ${
                        isCause ? 'web:desktop:bg-dangerSurface-light dark:web:desktop:bg-dangerSurface-dark' : ''
                      } ${index > 0 ? 'web:desktop:border-t web:desktop:border-divider-light dark:web:desktop:border-divider-dark' : ''}`}
                    >
                      <Text
                        className={`web:desktop:w-[52px] font-heeboBold text-caption ${
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
                      <View className="web:desktop:flex-1">
                        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
                          {event.title}
                        </Text>
                        {isCause ? (
                          <View className="web:desktop:mt-1">
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

          {hasShortfall ? (
            <View className="web:desktop:mt-4 web:desktop:rounded-hero web:desktop:border web:desktop:border-dangerBorder-light web:desktop:bg-surfaceMuted-light web:desktop:p-4 dark:web:desktop:border-dangerBorder-dark dark:web:desktop:bg-surfaceMuted-dark">
              <Text className="text-body font-sansSemibold text-danger-light dark:text-danger-dark">
                {t('cashFlow.forecast.shortfallWarningTitle')}
              </Text>
              <Text className="web:desktop:mt-1 text-caption text-danger-light dark:text-danger-dark">
                {t('cashFlow.forecast.shortfallWarningBody', { date: forecast.firstShortfallDate })}
              </Text>
              <Text className="web:desktop:mt-1 text-caption font-sansSemibold text-danger-light dark:text-danger-dark">
                {t('cashFlow.forecast.shortfallAmount', { amount: formatILS(-forecast.lowestBalanceAgorot) })}
              </Text>
            </View>
          ) : (
            <Text className="web:desktop:mt-3 text-caption text-positive-light dark:text-positive-dark">
              {t('cashFlow.forecast.noShortfall')}
            </Text>
          )}
        </>
      )}
    </Screen>
  )
}
