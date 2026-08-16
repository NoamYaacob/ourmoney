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
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { EmptyState } from '@/components/ui/EmptyState'

const HORIZON_OPTIONS: { value: HorizonKind; labelKey: string }[] = [
  { value: 'week', labelKey: 'cashFlow.horizon.week' },
  { value: 'month', labelKey: 'cashFlow.horizon.month' },
  { value: 'days30', labelKey: 'cashFlow.horizon.days30' },
]

export default function CashFlow() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const [horizonKind, setHorizonKind] = useState<HorizonKind>('month')
  const { result, isLoading, error } = useSafeToSpend(householdId, horizonKind)

  // Same fail-safe gate as every other screen keyed off useHousehold —
  // without it, a still-resolving householdId would render a fully
  // "loaded"-looking ₪0 summary indistinguishable from a real zero.
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
      <Text className="mb-6 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('cashFlow.title')}</Text>

      <SegmentedControl
        options={segmentedOptions}
        value={horizonKind}
        onChange={setHorizonKind}
        accessibilityLabel={t('cashFlow.title')}
      />

      <View className="mt-4 web:desktop:max-w-[600px]">
        {error ? (
          <ErrorMessage message={t('cashFlow.errors.generic')} />
        ) : isLoading ? (
          <LoadingSpinner />
        ) : (
          <>
            <Card>
              <View className="flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.availableCash')}
                </Text>
                <Text className="text-body text-ink-light dark:text-ink-dark">
                  {formatILS(result.availableCashAgorot)}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.plannedObligations')}
                </Text>
                <Text className="text-body text-ink-light dark:text-ink-dark">
                  {formatILS(-result.plannedObligationsAgorot)}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('cashFlow.recurringCharges')}
                </Text>
                <Text className="text-body text-ink-light dark:text-ink-dark">
                  {formatILS(-result.recurringAgorot)}
                </Text>
              </View>
              <View className="mt-2 flex-row items-center justify-between">
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{t('cashFlow.reserved')}</Text>
                <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(-result.reservedAgorot)}</Text>
              </View>

              <View className="my-3">
                <Divider />
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-body font-semibold text-ink-light dark:text-ink-dark">
                  {t('cashFlow.safeToSpend')}
                </Text>
                <Text
                  className={`text-heading font-bold ${
                    isShortfall ? 'text-danger-light dark:text-danger-dark' : 'text-ink-light dark:text-ink-dark'
                  }`}
                >
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

            <Text className="mb-2 mt-6 text-sm font-semibold text-ink-light dark:text-ink-dark">
              {t('cashFlow.itemsTitle')}
            </Text>
            {result.items.length === 0 ? (
              <EmptyState icon="📅" message={t('cashFlow.empty')} compact />
            ) : (
              <Card>
                {result.items.map((item, index) => (
                  <View key={`${item.sourceType}-${item.sourceId}-${item.date}`}>
                    {index > 0 && (
                      <View className="my-3">
                        <Divider />
                      </View>
                    )}
                    <Pressable
                      onPress={() =>
                        item.sourceType === 'obligation'
                          ? router.push(`/obligations/${item.sourceId}`)
                          : router.push(`/recurring/${item.sourceId}`)
                      }
                      accessibilityRole="button"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                          {item.description}
                        </Text>
                        <Text className="text-body text-ink-light dark:text-ink-dark">{formatILS(item.amountAgorot)}</Text>
                      </View>
                      <View className="mt-0.5 flex-row items-center justify-between">
                        <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">{item.date}</Text>
                        <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                          {t(`cashFlow.source.${item.sourceType}`)}
                        </Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </View>
    </Screen>
  )
}
