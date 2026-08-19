// Reached from the Dashboard Safe-to-Spend card, not a tab — same posture
// as accounts/recurring/goals/obligations. Renders the same result the card
// already summarizes, with the horizon switchable here and an itemized
// breakdown; no separate editing UI — each item opens its own existing
// detail screen (obligations/[id] or recurring/[id]).

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useSafeToSpend } from '@/features/cashflow/hooks/useSafeToSpend'
import { useCashFlowForecast } from '@/features/cashflow/hooks/useCashFlowForecast'
import { CashFlowForecastChart } from '@/features/cashflow/components/CashFlowForecastChart'
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'
import type { CashFlowForecastEvent } from '@/lib/engines/cashflow/calculateCashFlowForecast'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { DESKTOP_PANEL_CLASS } from '@/constants/layout'

const HORIZON_OPTIONS: { value: HorizonKind; labelKey: string }[] = [
  { value: 'week', labelKey: 'cashFlow.horizon.week' },
  { value: 'month', labelKey: 'cashFlow.horizon.month' },
  { value: 'days30', labelKey: 'cashFlow.horizon.days30' },
]

const FORECAST_HORIZON_OPTIONS: { value: '30' | '60' | '90'; labelKey: string }[] = [
  { value: '30', labelKey: 'cashFlow.forecast.horizon.days30' },
  { value: '60', labelKey: 'cashFlow.forecast.horizon.days60' },
  { value: '90', labelKey: 'cashFlow.forecast.horizon.days90' },
]

function forecastEventSourceLabel(event: CashFlowForecastEvent, t: (key: string) => string): string {
  if (event.source === 'planned_obligation') return t('cashFlow.forecast.source.planned_obligation')
  return event.direction === 'inflow' ? t('cashFlow.forecast.source.recurringIncome') : t('cashFlow.forecast.source.recurring')
}

export default function CashFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const [horizonKind, setHorizonKind] = useState<HorizonKind>('month')
  const { result, isLoading, error } = useSafeToSpend(householdId, horizonKind)
  const [forecastDays, setForecastDays] = useState<'30' | '60' | '90'>('30')
  const {
    result: forecast,
    isLoading: isForecastLoading,
    error: forecastError,
  } = useCashFlowForecast(householdId, Number(forecastDays))

  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  const segmentedOptions = HORIZON_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))
  const isShortfall = result.safeToSpendAgorot < 0

  return (
    <Screen width="wide">
      <View className="mb-7">
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
          {t('cashFlow.title')}
        </Text>
        <Text className="mt-1 hidden text-caption text-inkMuted-light dark:text-inkMuted-dark web:desktop:flex">
          {t('cashFlow.subtitle')}
        </Text>
      </View>

      {/* Visual QA + Desktop Polish pass: the safe-to-spend and forecast
          columns now match every other two-region desktop split in this app
          (Dashboard/Budgets/Settings/Categories) — `web:desktop:flex-row-
          reverse` (see _layout.tsx's DesktopSideRail comment for why
          `-reverse` is needed on web) keeps DOM/source order [safe-to-
          spend, forecast] while visually placing safe-to-spend (primary) on
          the right. Mobile/tablet stay stacked in the original order. */}
      <View className="web:desktop:flex-row-reverse web:desktop:items-start web:desktop:gap-6">
        <View className={`web:desktop:flex-1 ${DESKTOP_PANEL_CLASS}`}>
          <Text className="mb-2 text-sm font-semibold text-ink-light dark:text-ink-dark">
            {t('cashFlow.safeToSpendSectionTitle')}
          </Text>
          <SegmentedControl
            options={segmentedOptions}
            value={horizonKind}
            onChange={setHorizonKind}
            accessibilityLabel={t('cashFlow.safeToSpendSectionTitle')}
          />

          <View className="mt-4">
            {error ? (
              <ErrorMessage message={t('cashFlow.errors.generic')} />
            ) : isLoading ? (
              <LoadingSpinner />
            ) : (
              <>
                <Card>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.availableCash')}</Text>
                    <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(result.availableCashAgorot)}</Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.plannedObligations')}</Text>
                    <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(-result.plannedObligationsAgorot)}</Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.recurringCharges')}</Text>
                    <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(-result.recurringAgorot)}</Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.reserved')}</Text>
                    <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(-result.reservedAgorot)}</Text>
                  </View>
                  <View className="my-3"><Divider /></View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-body font-semibold text-ink-light dark:text-ink-dark">{t('cashFlow.safeToSpend')}</Text>
                    <Text className={`text-heading font-bold ${isShortfall ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'}`}>
                      {formatILS(result.safeToSpendAgorot)}
                    </Text>
                  </View>
                  {isShortfall && (
                    <Text className="mt-2 text-caption text-danger-light dark:text-danger-dark">
                      {t('cashFlow.shortfall', { amount: formatILS(result.shortfallAgorot) })}
                    </Text>
                  )}
                  {result.safeToSpendAgorot === 0 && (
                    <Text className="mt-2 text-caption text-danger-light dark:text-danger-dark">{t('cashFlow.zero')}</Text>
                  )}
                </Card>

                <Text className="mb-2 mt-6 text-sm font-semibold text-ink-light dark:text-ink-dark">{t('cashFlow.itemsTitle')}</Text>
                {result.items.length === 0 ? (
                  <EmptyState icon="📅" message={t('cashFlow.empty')} compact />
                ) : (
                  <Card>
                    {result.items.map((item, index) => (
                      <View key={`${item.sourceType}-${item.sourceId}-${item.date}`}>
                        {index > 0 && <View className="my-3"><Divider /></View>}
                        <Pressable
                          onPress={() => item.sourceType === 'obligation' ? router.push(`/obligations/${item.sourceId}`) : router.push(`/recurring/${item.sourceId}`)}
                          accessibilityRole="button"
                        >
                          <View className="flex-row items-center justify-between">
                            <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>{item.description}</Text>
                            <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(item.amountAgorot)}</Text>
                          </View>
                          <View className="mt-0.5 flex-row items-center justify-between">
                            <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">{item.date}</Text>
                            <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">{t(`cashFlow.source.${item.sourceType}`)}</Text>
                          </View>
                        </Pressable>
                      </View>
                    ))}
                  </Card>
                )}
              </>
            )}
          </View>
        </View>

        <View className={`mt-8 web:desktop:mt-0 web:desktop:flex-1 ${DESKTOP_PANEL_CLASS}`}>
          <Text className="mb-2 text-sm font-semibold text-ink-light dark:text-ink-dark">{t('cashFlow.forecast.sectionTitle')}</Text>
          <SegmentedControl
            options={FORECAST_HORIZON_OPTIONS.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            value={forecastDays}
            onChange={setForecastDays}
            accessibilityLabel={t('cashFlow.forecast.sectionTitle')}
          />

          <View className="mt-4">
            {forecastError ? (
              <ErrorMessage message={t('cashFlow.forecast.errors.generic')} />
            ) : isForecastLoading ? (
              <LoadingSpinner />
            ) : (
              <>
                <Card>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.forecast.availableCashToday')}</Text>
                    <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(forecast.startingBalanceAgorot)}</Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.forecast.projectedEndingBalance')}</Text>
                    <Text className={`text-body font-semibold ${forecast.endingBalanceAgorot < 0 ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'}`}>
                      {formatILS(forecast.endingBalanceAgorot)}
                    </Text>
                  </View>
                  <View className="mt-2 flex-row items-center justify-between">
                    <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.forecast.lowestBalance')}</Text>
                    <Text className={`text-body font-semibold ${forecast.lowestBalanceAgorot < 0 ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'}`}>
                      {formatILS(forecast.lowestBalanceAgorot)} · {forecast.lowestBalanceDate}
                    </Text>
                  </View>
                  <View className="mt-4">
                    <CashFlowForecastChart
                      dailyPoints={forecast.dailyPoints}
                      lowestBalanceDate={forecast.lowestBalanceDate}
                      chartSummary={`${t('cashFlow.forecast.availableCashToday')}: ${formatILS(forecast.startingBalanceAgorot)}. ${t('cashFlow.forecast.projectedEndingBalance')}: ${formatILS(forecast.endingBalanceAgorot)}. ${t('cashFlow.forecast.lowestBalance')}: ${formatILS(forecast.lowestBalanceAgorot)}.`}
                    />
                  </View>
                  {forecast.firstShortfallDate ? (
                    <View className="mt-4 rounded-control bg-danger-light/10 p-3 dark:bg-danger-dark/10">
                      <Text className="text-body font-semibold text-danger-light dark:text-danger-dark">{t('cashFlow.forecast.shortfallWarningTitle')}</Text>
                      <Text className="mt-1 text-caption text-danger-light dark:text-danger-dark">{t('cashFlow.forecast.shortfallWarningBody', { date: forecast.firstShortfallDate })}</Text>
                      <Text className="mt-1 text-caption font-semibold text-danger-light dark:text-danger-dark">{t('cashFlow.forecast.shortfallAmount', { amount: formatILS(-forecast.lowestBalanceAgorot) })}</Text>
                    </View>
                  ) : (
                    <Text className="mt-4 text-caption text-positive-light dark:text-positive-dark">{t('cashFlow.forecast.noShortfall')}</Text>
                  )}
                </Card>

                <Text className="mb-2 mt-6 text-sm font-semibold text-ink-light dark:text-ink-dark">{t('cashFlow.forecast.upcomingEventsTitle')}</Text>
                {forecast.events.length === 0 ? (
                  <EmptyState icon="📈" message={t('cashFlow.forecast.empty')} compact />
                ) : (
                  <Card>
                    {forecast.events.map((event, index) => (
                      <View key={event.id}>
                        {index > 0 && <View className="my-3"><Divider /></View>}
                        <Pressable
                          onPress={() => event.source === 'planned_obligation' ? router.push(`/obligations/${event.sourceId}`) : router.push(`/recurring/${event.sourceId}`)}
                          accessibilityRole="button"
                        >
                          <View className="flex-row items-center justify-between">
                            <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>{event.title}</Text>
                            <Text className={`text-body font-medium ${event.direction === 'inflow' ? 'text-positive-light dark:text-positive-dark' : 'text-ink-light dark:text-ink-dark'}`}>
                              {event.direction === 'inflow' ? '+' : ''}{formatILS(event.direction === 'inflow' ? event.amountAgorot : -event.amountAgorot)}
                            </Text>
                          </View>
                          <View className="mt-0.5 flex-row items-center justify-between">
                            <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">{event.date}{event.pastDue ? ` · ${t('cashFlow.forecast.pastDue')}` : ''}</Text>
                            <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">{forecastEventSourceLabel(event, t)}</Text>
                          </View>
                        </Pressable>
                      </View>
                    ))}
                  </Card>
                )}
                <Text className="mt-4 text-xs text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.forecast.disclaimer')}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Screen>
  )
}
