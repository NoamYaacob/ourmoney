import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { usePeriodStore } from '@/store/periodStore'
import { shiftMonth } from '@/features/budgets/lib/budgetPeriod'
import { remainingAgorot } from '@/lib/money/arithmetic'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Real MVP-2 dashboard, replacing the M1 placeholder. Every figure here is
// either a direct query result or derived via lib/money — never a bare `0`
// on a pending/failed query (fail-safe display principle, M6 plan §6).
export default function Dashboard() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const setPeriodStart = usePeriodStore((s) => s.setSelectedPeriodStart)
  const {
    categories: progress,
    totalAllocatedAgorot,
    totalSpentAgorot,
    isLoading: isProgressLoading,
    error: progressError,
  } = useBudgetProgress(householdId, periodStart)
  const { transactions, isLoading: isTransactionsLoading, error: transactionsError } = useTransactions(householdId, {
    periodStart,
  })

  const recentTransactions = transactions.slice(0, 5)

  // Fail-safe display: while useHousehold is still resolving (a real
  // network round trip on every cold start), householdId is null and every
  // downstream hook below is `enabled: false` — without this gate, the
  // screen would render a fully "loaded"-looking ₪0.00 summary that's
  // indistinguishable from a real zero-spend household (mobile-expo-
  // reviewer finding, confirmed systemic across every new M6 screen).
  if (isHouseholdLoading) {
    return (
      <Screen center>
        <LoadingSpinner />
      </Screen>
    )
  }

  return (
    <Screen>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-2xl font-bold text-ink-light dark:text-ink-dark">{t('dashboard.title')}</Text>
      </View>

      <View className="mb-4 flex-row items-center justify-between">
        <Pressable onPress={() => setPeriodStart(shiftMonth(periodStart, -1))} accessibilityRole="button">
          <Text className="text-base text-accent-light dark:text-accent-dark">{t('budgets.prevMonth')}</Text>
        </Pressable>
        <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">{periodStart.slice(0, 7)}</Text>
        <Pressable onPress={() => setPeriodStart(shiftMonth(periodStart, 1))} accessibilityRole="button">
          <Text className="text-base text-accent-light dark:text-accent-dark">{t('budgets.nextMonth')}</Text>
        </Pressable>
      </View>

      {progressError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isProgressLoading ? (
        <LoadingSpinner />
      ) : (
        <Card>
          <View className="flex-row justify-between">
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.spent')}</Text>
            <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">
              {formatILS(totalSpentAgorot)}
            </Text>
          </View>
          <View className="mt-1 flex-row justify-between">
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.remaining')}</Text>
            <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">
              {formatILS(remainingAgorot(totalAllocatedAgorot, totalSpentAgorot))}
            </Text>
          </View>
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.categoriesTitle')}
      </Text>
      {!isProgressLoading && !progressError && (
        <Card>
          {progress.length === 0 ? (
            <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.noBudget')}</Text>
          ) : (
            progress.map((category, index) => (
              <View key={category.categoryId}>
                {index > 0 && (
                  <View className="my-2">
                    <Divider />
                  </View>
                )}
                <View className="mb-1 flex-row items-center justify-between">
                  <Text className="text-sm text-ink-light dark:text-ink-dark">
                    {category.categoryIcon} {category.categoryNameHe}
                  </Text>
                  <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(category.spentAgorot)} / {formatILS(category.allocatedAgorot)}
                  </Text>
                </View>
                <ProgressBar percent={category.percentSpent} />
              </View>
            ))
          )}
        </Card>
      )}

      <Text className="mb-2 mt-6 text-sm font-semibold text-inkMuted-light dark:text-inkMuted-dark">
        {t('dashboard.recentTitle')}
      </Text>
      {transactionsError ? (
        <ErrorMessage message={t('dashboard.errors.generic')} />
      ) : isTransactionsLoading ? (
        <LoadingSpinner />
      ) : recentTransactions.length === 0 ? (
        <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">{t('dashboard.noTransactions')}</Text>
      ) : (
        <Card>
          {recentTransactions.map((txn, index) => (
            <View key={txn.id}>
              {index > 0 && (
                <View className="my-2">
                  <Divider />
                </View>
              )}
              <Pressable onPress={() => router.push(`/transactions/${txn.id}`)} accessibilityRole="button">
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 text-sm text-ink-light dark:text-ink-dark">{txn.description}</Text>
                  <Text className="text-sm text-inkMuted-light dark:text-inkMuted-dark">
                    {formatILS(txn.amount_agorot)}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />
    </Screen>
  )
}
