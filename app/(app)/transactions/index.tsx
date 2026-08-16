import { FlatList, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import {
  buildTransactionQueryFilters,
  DEFAULT_TRANSACTION_FILTER_STATE,
  filterTransactionsLocally,
  isDefaultTransactionFilterState,
  parseTransactionFilterParams,
  transactionFilterStateToParams,
  type TransactionFilterState,
  type TransactionTypeFilter,
  type TransactionSharedFilter,
} from '@/features/transactions/lib/transactionFilters'
import { TRANSACTION_PERIODS, type TransactionPeriod } from '@/features/transactions/lib/transactionPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { formatILS } from '@/lib/money/format'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { colors } from '@/constants/colors'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { FAB } from '@/components/ui/FAB'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Transaction } from '@/types/app'

const TYPE_FILTER_VALUES: TransactionTypeFilter[] = ['all', 'expense', 'income']
const SHARED_FILTER_VALUES: TransactionSharedFilter[] = ['all', 'shared', 'personal']

export default function Transactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts } = useAccounts(householdId)
  const { categories } = useCategories(householdId)
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name_he]))
  const categoryIconById = Object.fromEntries(categories.map((c) => [c.id, c.icon]))

  // Filter state lives on the route itself (query params), not component
  // state — this is what survives Transactions -> Transaction Detail ->
  // back regardless of whether the navigator happens to keep this screen
  // instance mounted underneath, and (on web) makes the current filter set
  // a shareable/bookmarkable URL for free.
  const rawParams = useLocalSearchParams<{
    q?: string
    period?: string
    accountId?: string
    categoryId?: string
    type?: string
    shared?: string
  }>()
  // Cheap (a handful of string comparisons) — no memo needed.
  const filterState = parseTransactionFilterParams(rawParams)

  function updateFilters(partial: Partial<TransactionFilterState>) {
    const next: TransactionFilterState = { ...filterState, ...partial }
    router.setParams(transactionFilterStateToParams(next))
  }

  function clearFilters() {
    router.setParams(transactionFilterStateToParams(DEFAULT_TRANSACTION_FILTER_STATE))
  }

  // Server-side portion (account/category/period/shared) — see
  // transactionFilters.ts's own header comment for why this split exists.
  // Pushing these into the Supabase query is what keeps e.g. "current
  // month" from pulling a household's entire history over the network.
  // No memo needed here: TanStack Query's queryKey equality is structural
  // (value-based hashing), not reference-based, so a fresh-but-equal
  // filters object on every render does not trigger a refetch.
  const serverFilters = buildTransactionQueryFilters(filterState)
  const { transactions, isLoading, error } = useTransactions(householdId, serverFilters)
  // Fail-safe display: householdId is briefly null while useHousehold
  // itself is still resolving, during which useTransactions' own isLoading
  // is false (enabled: !!householdId) — without folding in
  // isHouseholdLoading, the empty-list state below would render as if the
  // household genuinely has zero transactions (mobile-expo-reviewer
  // finding, systemic across the new M6 screens).
  const isPageLoading = isHouseholdLoading || isLoading

  // Client-side portion (search text + income/expense type) — a single O(n)
  // pass over the already server-narrowed set. No manual useMemo: this
  // codebase's React Compiler auto-memoizes derived values like this one
  // (matching every other plain derived computation in this file, e.g.
  // categoryNameById above) — a hand-written useMemo here actually fights
  // the compiler's own dependency analysis (react-hooks/preserve-manual-
  // memoization) rather than helping it.
  const filteredTransactions = filterTransactionsLocally(
    transactions,
    { search: filterState.search, type: filterState.type },
    categoryNameById
  )

  const isFilterActive = !isDefaultTransactionFilterState(filterState)
  // "True empty" (household has never had a transaction, ignoring
  // filters) vs "no results" (filters/search narrowed a real history down
  // to zero) — the same zero-length check means something different
  // depending on whether any filter is active, since with every filter at
  // its default the server query is exactly the same unfiltered fetch this
  // screen used before this milestone.
  const showTrueEmpty = !isPageLoading && !isFilterActive && filteredTransactions.length === 0
  const showNoResults = !isPageLoading && isFilterActive && filteredTransactions.length === 0

  const accountOptions = [
    { value: 'all', label: t('transactions.filters.allAccounts') },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ]
  const categoryOptions = [
    { value: 'all', label: t('transactions.filters.allCategories') },
    { value: 'uncategorized', label: t('transactions.filters.uncategorized') },
    ...categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) })),
  ]
  const periodOptions = TRANSACTION_PERIODS.map((period) => ({
    value: period,
    label: t(`transactions.filters.period.${period}`),
  }))

  return (
    <Screen
      scroll={false}
      width="medium"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      <View className="mb-6 flex-row items-center justify-between web:flex-row-reverse">
        <Text className="text-title font-bold text-ink-light dark:text-ink-dark web:desktop:text-[28px]">
          {t('transactions.title')}
        </Text>
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

      <Input
        label={t('transactions.filters.searchLabel')}
        value={filterState.search}
        onChangeText={(text) => updateFilters({ search: text })}
        placeholder={t('transactions.filters.searchPlaceholder')}
      />

      <View className="mb-2 flex-row flex-wrap gap-2">
        <View className="min-w-[110px] flex-1 rounded-xl border border-border-light bg-surfaceMuted-light px-3 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Select
            variant="row"
            label={t('transactions.filters.periodLabel')}
            options={periodOptions}
            value={filterState.period}
            onChange={(value) => updateFilters({ period: value as TransactionPeriod })}
            placeholder={t('transactions.filters.periodLabel')}
          />
        </View>
        <View className="min-w-[110px] flex-1 rounded-xl border border-border-light bg-surfaceMuted-light px-3 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Select
            variant="row"
            label={t('transactions.filters.accountLabel')}
            options={accountOptions}
            value={filterState.accountId ?? 'all'}
            onChange={(value) => updateFilters({ accountId: value === 'all' ? null : value })}
            placeholder={t('transactions.filters.accountLabel')}
          />
        </View>
        <View className="min-w-[110px] flex-1 rounded-xl border border-border-light bg-surfaceMuted-light px-3 dark:border-border-dark dark:bg-surfaceMuted-dark">
          <Select
            variant="row"
            label={t('transactions.filters.categoryLabel')}
            options={categoryOptions}
            value={filterState.categoryId ?? 'all'}
            onChange={(value) => updateFilters({ categoryId: value === 'all' ? null : value })}
            placeholder={t('transactions.filters.categoryLabel')}
            sheetTitle={t('transactions.filters.categoryLabel')}
          />
        </View>
      </View>

      <View className="mb-2 flex-row flex-wrap gap-2">
        {TYPE_FILTER_VALUES.map((value) => (
          <Chip
            key={value}
            testID={`transactions-filter-type-${value}`}
            label={t(`transactions.filters.type.${value}`)}
            selected={filterState.type === value}
            onPress={() => updateFilters({ type: value })}
          />
        ))}
      </View>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {SHARED_FILTER_VALUES.map((value) => (
          <Chip
            key={value}
            testID={`transactions-filter-shared-${value}`}
            label={t(`transactions.filters.shared.${value}`)}
            selected={filterState.shared === value}
            onPress={() => updateFilters({ shared: value })}
          />
        ))}
      </View>

      {!isPageLoading && !error && (
        <View className="mb-4 flex-row items-center justify-between web:flex-row-reverse">
          <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
            {t('transactions.filters.resultCount', { count: filteredTransactions.length })}
          </Text>
          {isFilterActive && (
            <Pressable onPress={clearFilters} accessibilityRole="button">
              <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                {t('transactions.filters.clear')}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {error ? (
        <ErrorMessage message={t('transactions.errors.generic')} />
      ) : isPageLoading ? (
        <SkeletonList rows={5} />
      ) : showTrueEmpty ? (
        // Phase 3.1: dropped the actionLabel button — the screen's own
        // floatingAction FAB already does the identical "add a
        // transaction" action, so showing both was a redundant, competing
        // CTA.
        //
        // Desktop polish pass (round 2): a real-browser visual review
        // found the previous desktop treatment — a `self-end`-anchored,
        // modestly-sized box near the top — still read as "a small card
        // floating in a huge blank page," especially at typical ~900px
        // viewport heights. `web:desktop:flex-1 web:desktop:justify-center`
        // (Screen's own content column is already a `flex-1` column, see
        // Screen.tsx) makes this box claim the remaining vertical space
        // below the header and centers its content within it — the
        // available space is used deliberately instead of left as dead
        // canvas beneath a small anchored box. Mobile is untouched: without
        // `web:desktop:`, it stays the exact original unscoped "items-center
        // pt-10" box (flex-1/justify-center was deliberately rejected for
        // mobile in an earlier pass — see the dedicated regression test
        // below for why that choice is guarded, not reintroduced here).
        <View className="items-center pt-10 web:desktop:flex-1 web:desktop:justify-center web:desktop:pt-0">
          <View className="web:desktop:w-full web:desktop:max-w-[520px] web:desktop:rounded-card web:desktop:border web:desktop:border-border-light web:desktop:bg-surfaceMuted-light web:desktop:px-10 web:desktop:py-16 dark:web:desktop:border-border-dark dark:web:desktop:bg-surfaceMuted-dark">
            {/* Two EmptyState renders, not one — `compact` is a single
                fixed prop with no responsive variant, and desktop's roomier
                card calls for the larger icon/spacing `compact={false}`
                already gives every other full-size empty state in this app,
                while mobile keeps the exact original compact treatment. */}
            <View className="web:desktop:hidden">
              <EmptyState iconName="receipt-outline" message={t('transactions.empty')} compact />
            </View>
            <View className="hidden web:desktop:flex">
              <EmptyState iconName="receipt-outline" message={t('transactions.empty')} />
            </View>
          </View>
        </View>
      ) : showNoResults ? (
        <View className="items-center pt-10">
          <EmptyState
            iconName="search-outline"
            message={t('transactions.noResults')}
            actionLabel={t('transactions.filters.clear')}
            onAction={clearFilters}
            compact
          />
        </View>
      ) : (
        <FlatList<Transaction>
          data={filteredTransactions}
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
