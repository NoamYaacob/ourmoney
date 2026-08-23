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

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/colors'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { CashFlowForecastChart } from '@/features/cashflow/components/CashFlowForecastChart'
import type { CashFlowForecastEvent } from '@/lib/engines/cashflow/calculateCashFlowForecast'
import { causeOfLowPoint } from '@/features/cashflow/lib/lowPointCause'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { Screen } from '@/components/ui/Screen'
import { Money } from '@/components/ui/Money'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { StatusChip } from '@/components/ui/StatusChip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { DESKTOP_CARD_CLASS } from '@/constants/layout'

const HORIZONS = [
  { value: '30' as const, labelKey: 'cashFlow.forecast.horizon.days30' },
  { value: '60' as const, labelKey: 'cashFlow.forecast.horizon.days60' },
  { value: '90' as const, labelKey: 'cashFlow.forecast.horizon.days90' },
]

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
  const [days, setDays] = useState<'30' | '60' | '90'>('30')
  const { result: forecast, isLoading, error } = useCashFlowForecast(householdId, Number(days))

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
      <View className="mb-6 flex-row items-center justify-between web:desktop:flex-row">
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[20px]">
          {t('tabs.cashFlow')}
        </Text>
        <View className="web:desktop:w-[220px]">
          <SegmentedControl
            options={HORIZONS.map((horizon) => ({ value: horizon.value, label: t(horizon.labelKey) }))}
            value={days}
            onChange={setDays}
            accessibilityLabel={t('cashFlow.forecast.sectionTitle')}
          />
        </View>
      </View>

      {error ? (
        <ErrorMessage message={t('cashFlow.forecast.errors.generic')} />
      ) : isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          {/* The answer, in one sentence. */}
          <View
            className={`web:desktop:flex-row web:desktop:items-center web:desktop:gap-4 web:desktop:rounded-hero web:desktop:border web:desktop:p-5 ${
              hasShortfall
                ? 'web:desktop:border-dangerBorder-light web:desktop:bg-surfaceMuted-light dark:web:desktop:border-dangerBorder-dark dark:web:desktop:bg-surfaceMuted-dark'
                : `web:desktop:border-border-light web:desktop:bg-surfaceMuted-light dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark`
            }`}
          >
            <Ionicons
              name={hasShortfall ? 'alert-circle' : 'checkmark-circle'}
              size={24}
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

          {/* The evidence: the three headline figures, then the chart. */}
          <View className={`web:desktop:mt-4 ${DESKTOP_CARD_CLASS}`}>
            <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-9">
              <View>
                <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.today')}
                </Text>
                <Money agorot={forecast.startingBalanceAgorot} size="display" />
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
                <Money agorot={forecast.lowestBalanceAgorot} size="display" tone={forecast.lowestBalanceAgorot < 0 ? 'danger' : 'default'} />
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{formatDateDisplay(forecast.lowestBalanceDate)}</Text>
              </View>
              <View>
                <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.atEnd')}
                </Text>
                <Money agorot={forecast.endingBalanceAgorot} size="display" tone={forecast.endingBalanceAgorot < 0 ? 'danger' : 'default'} />
              </View>
            </View>

            <View className="web:desktop:mt-4">
              <CashFlowForecastChart
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
                      className={`web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-row web:desktop:py-2.5 ${
                        isCause ? 'web:desktop:bg-dangerSurface-light dark:web:desktop:bg-dangerSurface-dark web:desktop:px-3' : ''
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
