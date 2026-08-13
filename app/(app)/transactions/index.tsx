import { FlatList, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { formatILS } from '@/lib/money/format'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { colors } from '@/constants/colors'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { FAB } from '@/components/ui/FAB'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Transaction } from '@/types/app'

export default function Transactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { transactions, isLoading, error } = useTransactions(householdId)
  const { categories } = useCategories(householdId)
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name_he]))
  const categoryIconById = Object.fromEntries(categories.map((c) => [c.id, c.icon]))
  // Fail-safe display: householdId is briefly null while useHousehold
  // itself is still resolving, during which useTransactions' own isLoading
  // is false (enabled: !!householdId) — without folding in
  // isHouseholdLoading, the empty-list state below would render as if the
  // household genuinely has zero transactions (mobile-expo-reviewer
  // finding, systemic across the new M6 screens).
  const isPageLoading = isHouseholdLoading || isLoading

  return (
    <Screen
      scroll={false}
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark">{t('transactions.title')}</Text>
        {/* Design Phase 3: a small secondary link, not a Button — this is a
            utility action, not a peer of the primary "add transaction"
            flow, and shouldn't visually compete with the screen title. Same
            treatment as Dashboard's "כל התנועות" link. */}
        <Pressable
          onPress={() => router.push('/transactions/import')}
          accessibilityRole="button"
          className="flex-row items-center gap-1"
        >
          <Ionicons name="cloud-upload-outline" size={16} color={accentColor} />
          <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
            {t('import.entryButton')}
          </Text>
        </Pressable>
      </View>

      {error ? (
        <ErrorMessage message={t('transactions.errors.generic')} />
      ) : isPageLoading ? (
        <SkeletonList rows={5} />
      ) : transactions.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            iconName="receipt-outline"
            message={t('transactions.empty')}
            actionLabel={t('transactions.addButton')}
            onAction={() => router.push('/transactions/new')}
          />
        </View>
      ) : (
        <FlatList<Transaction>
          data={transactions}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => {
            const categoryName = item.category_id ? categoryNameById[item.category_id] : undefined
            return (
              <Pressable onPress={() => router.push(`/transactions/${item.id}`)} accessibilityRole="button">
                <Card>
                  <View className="flex-row items-center gap-3">
                    <CategoryIcon icon={item.category_id ? categoryIconById[item.category_id] : undefined} size="sm" />
                    <View className="flex-1">
                      <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {item.description}
                      </Text>
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                        {categoryName ? `${categoryName} · ${item.txn_date}` : item.txn_date}
                        {!item.is_shared ? ` · ${t('transactions.form.personal')}` : ''}
                      </Text>
                    </View>
                    <Text
                      className={
                        item.amount_agorot > 0
                          ? 'text-body font-medium text-positive-light dark:text-positive-dark'
                          : 'text-body font-medium text-ink-light dark:text-ink-dark'
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
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                        {t('transactions.excludedLabel')}
                      </Text>
                    </>
                  )}
                </Card>
              </Pressable>
            )
          }}
        />
      )}
    </Screen>
  )
}
