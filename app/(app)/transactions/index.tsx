import { FlatList, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { FAB } from '@/components/ui/FAB'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import type { Transaction } from '@/types/app'

export default function Transactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { transactions, isLoading, error } = useTransactions(householdId)
  // Fail-safe display: householdId is briefly null while useHousehold
  // itself is still resolving, during which useTransactions' own isLoading
  // is false (enabled: !!householdId) — without folding in
  // isHouseholdLoading, the empty-list state below would render as if the
  // household genuinely has zero transactions (mobile-expo-reviewer
  // finding, systemic across the new M6 screens).
  const isPageLoading = isHouseholdLoading || isLoading

  return (
    <Screen scroll={false}>
      <Text className="mb-4 text-2xl font-bold text-ink-light dark:text-ink-dark">{t('transactions.title')}</Text>

      {error ? (
        <ErrorMessage message={t('transactions.errors.generic')} />
      ) : isPageLoading ? (
        <LoadingSpinner />
      ) : transactions.length === 0 ? (
        <Text className="text-center text-base text-inkMuted-light dark:text-inkMuted-dark">
          {t('transactions.empty')}
        </Text>
      ) : (
        <FlatList<Transaction>
          data={transactions}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/transactions/${item.id}`)} accessibilityRole="button">
              <Card>
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink-light dark:text-ink-dark">
                      {item.description}
                    </Text>
                    <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">{item.txn_date}</Text>
                  </View>
                  <Text
                    className={
                      item.amount_agorot < 0
                        ? 'text-base font-semibold text-ink-light dark:text-ink-dark'
                        : 'text-base font-semibold text-accent-light dark:text-accent-dark'
                    }
                  >
                    {formatILS(item.amount_agorot)}
                  </Text>
                </View>
                {item.is_excluded && (
                  <>
                    <View className="my-2">
                      <Divider />
                    </View>
                    <Text className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
                      {t('transactions.excludedLabel')}
                    </Text>
                  </>
                )}
              </Card>
            </Pressable>
          )}
        />
      )}

      <FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />
    </Screen>
  )
}
