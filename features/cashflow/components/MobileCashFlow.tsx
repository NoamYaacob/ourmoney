// Screen 06 of the mobile design — "האם הכסף שלי עומד להספיק?"
//
// The order is the answer first, then the evidence. A household opening
// this tab mid-month wants one sentence, and the chart exists to show them
// why that sentence is true — so the sentence sits above the chart, not
// under it as a caption.
//
// The event that causes the low point is highlighted in the list below and
// tagged. That link is the screen's whole point: a dip on a line is not
// actionable, "the car licence on the 4th is what does it" is.
//
// One thing from the design file is deliberately absent: its dark
// "שלוש דרכים לצאת מזה" panel, which proposed ranked ways to fix a
// shortfall. No engine computes that, and CLAUDE.md is explicit that
// engines compute while nothing invents financial advice. Rather than
// hard-code plausible-looking suggestions, the panel is left out and
// recorded in the handoff notes as needing a real engine first.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Ionicons } from '@expo/vector-icons'
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
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatusChip } from '@/components/ui/StatusChip'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'

// Abbreviated, as the phone frame draws them: "30 י׳ · 60 · 90". The word
// "ימים" three times over does not fit beside the screen title in a 390px
// header row, and the frame does not try — the unit is stated once.
const HORIZONS = [
  { value: '30' as const, labelKey: 'cashFlow.forecast.horizon.days30Short' },
  { value: '60' as const, labelKey: 'cashFlow.forecast.horizon.days60Short' },
  { value: '90' as const, labelKey: 'cashFlow.forecast.horizon.days90Short' },
]

function eventRoute(event: CashFlowForecastEvent): string {
  if (event.source === 'planned_obligation') return `/obligations/${event.sourceId}`
  if (event.source === 'installment_plan') return `/installments/${event.sourceId}`
  return `/recurring/${event.sourceId}`
}

export function MobileCashFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const [days, setDays] = useState<'30' | '60' | '90'>('30')
  const { result: forecast, isLoading, error, refetch } = useCashFlowForecast(householdId, Number(days))

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
      <View className="min-h-[44px] flex-row items-center justify-between gap-3">
        <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{t('tabs.cashFlow')}</Text>
        <View className="w-[132px]">
          <SegmentedControl
            options={HORIZONS.map((horizon) => ({ value: horizon.value, label: t(horizon.labelKey) }))}
            value={days}
            onChange={setDays}
            accessibilityLabel={t('cashFlow.forecast.sectionTitle')}
          />
        </View>
      </View>

      {error ? (
        <View className="mt-4">
          <ErrorMessage message={t('cashFlow.forecast.errors.generic')} onRetry={refetch} />
        </View>
      ) : isLoading ? (
        <View className="mt-4">
          <SkeletonList rows={4} />
        </View>
      ) : (
        <>
          {/* The answer, in one sentence. */}
          <View
            className={`mt-3 flex-row items-start gap-3 rounded-card border p-4 ${
              hasShortfall
                ? 'border-dangerBorder-light bg-surfaceMuted-light dark:border-dangerBorder-dark dark:bg-surfaceMuted-dark'
                : 'border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark'
            }`}
          >
            <View
              className={`h-9 w-9 items-center justify-center rounded-row ${
                hasShortfall
                  ? 'bg-dangerSurface-light dark:bg-dangerSurface-dark'
                  : 'bg-positiveTint-light dark:bg-positiveTint-dark'
              }`}
            >
              <Ionicons
                name={hasShortfall ? 'trending-down' : 'checkmark-circle-outline'}
                size={ICON.nav}
                color={
                  hasShortfall
                    ? isDark
                      ? colors.danger.dark
                      : colors.danger.light
                    : isDark
                      ? colors.positive.dark
                      : colors.positive.light
                }
              />
            </View>
            <Text className="flex-1 text-bodySm font-sans text-ink-light dark:text-ink-dark">
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

          {/* The evidence. */}
          <View className="mt-3 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
            {/* Wraps rather than shrinks or truncates. The frame fits three
                figures on one line because its own are four digits; a
                household with a five-digit balance and agorot gets 2 + 1.
                Each column takes its natural width — constraining them to
                equal thirds is what turned a collision into a truncated
                amount, and a truncated amount is worse than either. The
                design system's density rule is explicit: nothing shrinks to
                fit, what does not fit moves. */}
            <View className="flex-row flex-wrap justify-between gap-x-4 gap-y-3">
              <View>
                <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.today')}
                </Text>
                <Money agorot={forecast.startingBalanceAgorot} size="large" />
              </View>
              <View className="items-center">
                <Text
                  className={`text-meta font-sansSemibold tracking-[0.06em] ${
                    forecast.lowestBalanceAgorot < 0
                      ? 'text-dangerStrong-light dark:text-dangerStrong-dark'
                      : 'text-inkMuted-light dark:text-inkMuted-dark'
                  }`}
                >
                  {t('cashFlow.mobile.lowPoint')}
                </Text>
                <Money
                  agorot={forecast.lowestBalanceAgorot}
                  size="large"
                  tone={forecast.lowestBalanceAgorot < 0 ? 'danger' : 'default'}
                />
              </View>
              <View className="items-end">
                <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.mobile.atEnd')}
                </Text>
                <Money
                  agorot={forecast.endingBalanceAgorot}
                  size="large"
                  tone={forecast.endingBalanceAgorot < 0 ? 'danger' : 'default'}
                />
              </View>
            </View>

            <View className="mt-4">
              <ForecastChart
                dailyPoints={forecast.dailyPoints}
                lowestBalanceDate={forecast.lowestBalanceDate}
                chartSummary={`${t('cashFlow.mobile.today')}: ${formatILS(forecast.startingBalanceAgorot)}. ${t('cashFlow.mobile.lowPoint')}: ${formatILS(forecast.lowestBalanceAgorot)}, ${formatDateDisplay(forecast.lowestBalanceDate)}. ${t('cashFlow.mobile.atEnd')}: ${formatILS(forecast.endingBalanceAgorot)}.`}
              />
            </View>
          </View>

          <SectionLabel
            className="mb-2 mt-4"
            trailing={
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('cashFlow.mobile.eventsCount', { count: forecast.events.length })}
              </Text>
            }
          >
            {t('cashFlow.mobile.eventsTitle')}
          </SectionLabel>

          {forecast.events.length === 0 ? (
            <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('cashFlow.mobile.eventsEmpty')}
            </Text>
          ) : (
            <View className="overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark">
              {forecast.events.map((event, index) => {
                const isCause = cause?.id === event.id
                const isInflow = event.direction === 'inflow'
                return (
                  <View key={event.id}>
                    {index > 0 && <View className="h-px bg-divider-light dark:bg-divider-dark" />}
                    <Pressable
                      onPress={() => router.push(eventRoute(event) as never)}
                      accessibilityRole="button"
                      accessibilityLabel={event.title}
                      className={
                        isCause
                          ? 'bg-dangerSurface-light dark:bg-dangerSurface-dark'
                          : 'active:bg-surface-light dark:active:bg-surface-dark'
                      }
                    >
                      <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3">
                        <Text
                          className={`w-12 font-heeboBold text-caption ${
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
                        <View className="min-w-0 flex-1">
                          <Text
                            className="text-body font-sansSemibold text-ink-light dark:text-ink-dark"
                            numberOfLines={1}
                          >
                            {event.title}
                          </Text>
                          {isCause ? (
                            <View className="mt-1">
                              <StatusChip
                                label={
                                  hasShortfall ? t('cashFlow.mobile.causeTag') : t('cashFlow.mobile.causeTagLow')
                                }
                                tone="danger"
                              />
                            </View>
                          ) : (
                            <Text className="mt-0.5 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                              {event.pastDue
                                ? t('cashFlow.forecast.pastDue')
                                : t(`cashFlow.commitments.source.${event.source === 'planned_obligation' ? 'obligation' : event.source === 'installment_plan' ? 'installment' : 'recurring'}`)}
                            </Text>
                          )}
                        </View>
                        <Money
                          agorot={isInflow ? event.amountAgorot : -event.amountAgorot}
                          size="row"
                          tone={isInflow ? 'positive' : 'default'}
                          signed
                        />
                      </View>
                    </Pressable>
                  </View>
                )
              })}
            </View>
          )}

          <Text className="mt-3 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {t('cashFlow.forecast.disclaimer')}
          </Text>
        </>
      )}

      <View className="h-4" />
    </Screen>
  )
}
