// Screen 03 of the mobile design — a feed, not a table.
//
// Four departures from the desktop screen, each one the brief's:
//
//   1. Filters live in a sheet. On the desktop screen they sit permanently
//      above the list; on a phone that cost about a third of the screen
//      before a single transaction appeared. What stays here is a compact
//      row of the filters actually applied, each removable by tapping it.
//   2. Transactions group by date, with the day's own outgoing total on the
//      group header — the shape a household reads a statement in.
//   3. Uncategorised transactions get a task strip at the top: how many,
//      how much they keep out of the budget, and one button to go fix it.
//      It is a job to finish, not an error to feel bad about.
//   4. Search is behind a toggle rather than always occupying a field.
//
// Bulk selection is kept exactly as the desktop screen has it. The design
// file has no bulk mode, but it is real functionality and dropping it on
// mobile would be a regression rather than a simplification.

import { useMemo, useState } from 'react'
import { FlatList, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useUncategorizedTransactions } from '@/features/budgets/hooks/useUncategorizedTransactions'
import {
  buildTransactionQueryFilters,
  DEFAULT_TRANSACTION_FILTER_STATE,
  filterTransactionsLocally,
  isDefaultTransactionFilterState,
  parseTransactionFilterParams,
  type TransactionFilterState,
} from '@/features/transactions/lib/transactionFilters'
import { groupTransactionsByDate, dateGroupHeading } from '@/features/transactions/lib/groupByDate'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { TransactionFilterSheet } from '@/features/transactions/components/TransactionFilterSheet'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { formatILS } from '@/lib/money/format'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { FAB } from '@/components/ui/FAB'
import { Money } from '@/components/ui/Money'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatusChip } from '@/components/ui/StatusChip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Transaction } from '@/types/app'
import type { TransactionDateGroup } from '@/features/transactions/lib/groupByDate'

// Which parts of the filter state show up as a removable chip. `search` is
// excluded: it already has its own visible field when open, and a chip
// repeating the typed text would be the same control twice.
function activeFilterChips(
  state: TransactionFilterState,
  t: (key: string) => string,
  accountName: (id: string) => string,
  categoryName: (id: string) => string
): { key: keyof TransactionFilterState; label: string }[] {
  const chips: { key: keyof TransactionFilterState; label: string }[] = []

  if (state.period !== DEFAULT_TRANSACTION_FILTER_STATE.period) {
    chips.push({ key: 'period', label: t(`transactions.filters.period.${state.period}`) })
  }
  if (state.type !== 'all') chips.push({ key: 'type', label: t(`transactions.filters.type.${state.type}`) })
  if (state.shared !== 'all') chips.push({ key: 'shared', label: t(`transactions.filters.shared.${state.shared}`) })
  if (state.accountId) chips.push({ key: 'accountId', label: accountName(state.accountId) })
  if (state.categoryId) {
    chips.push({
      key: 'categoryId',
      label:
        state.categoryId === 'uncategorized'
          ? t('transactions.filters.uncategorized')
          : categoryName(state.categoryId),
    })
  }

  return chips
}

export function MobileTransactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useLocalSearchParams<{
    period?: string
    type?: string
    shared?: string
    accountId?: string
    categoryId?: string
    search?: string
  }>()
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const inkColor = isDark ? colors.ink.dark : colors.ink.light
  const mutedColor = isDark ? colors.inkMuted.dark : colors.inkMuted.light

  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const [filters, setFilters] = useState<TransactionFilterState>(() => parseTransactionFilterParams(params))
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false)
  const [isSearchOpen, setSearchOpen] = useState(false)

  const queryFilters = buildTransactionQueryFilters(filters)
  const { transactions, isLoading, error } = useTransactions(householdId, queryFilters)
  const { accounts } = useAccounts(householdId)
  const { categories } = useCategories(householdId)
  const { uncategorized } = useUncategorizedTransactions(householdId)

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.name_he])),
    [categories]
  )
  const categoryIconById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, category.icon])),
    [categories]
  )
  const accountNameById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account.name])),
    [accounts]
  )

  const filtered = filterTransactionsLocally(transactions, filters, categoryNameById)
  const groups = useMemo(() => groupTransactionsByDate(filtered), [filtered])
  const today = localDateString()

  const chips = activeFilterChips(
    filters,
    t,
    (id) => accountNameById[id] ?? '',
    (id) => categoryNameById[id] ?? ''
  )
  const uncategorizedTotalAgorot = uncategorized.reduce(
    (sum, transaction) => sum + Math.abs(transaction.amount_agorot),
    0
  )

  function clearFilter(key: keyof TransactionFilterState) {
    setFilters((current) => ({ ...current, [key]: DEFAULT_TRANSACTION_FILTER_STATE[key] }))
  }

  if (isHouseholdLoading) {
    return (
      <Screen>
        <SkeletonList rows={5} />
      </Screen>
    )
  }

  const hasNoTransactionsAtAll = !isLoading && !error && transactions.length === 0 && isDefaultTransactionFilterState(filters)
  const showNoResults = !isLoading && !error && filtered.length === 0 && !hasNoTransactionsAtAll

  function renderGroup({ item: group }: { item: TransactionDateGroup }) {
    const heading = dateGroupHeading(group.date, today)

    return (
      <View className="mb-4">
        <SectionLabel
          className="mb-1.5"
          trailing={
            group.spentAgorot > 0 ? <Money agorot={group.spentAgorot} size="caption" tone="muted" /> : undefined
          }
        >
          {heading.relativeKey
            ? `${t(`transactions.mobile.${heading.relativeKey}`)} · ${heading.shortDate}`
            : heading.shortDate}
        </SectionLabel>

        <View className="overflow-hidden rounded-card border border-border-light bg-surfaceMuted-light dark:border-border-dark dark:bg-surfaceMuted-dark">
          {group.transactions.map((transaction, index) => {
            const isTransfer = transaction.transfer_id !== null
            const categoryName = transaction.category_id ? categoryNameById[transaction.category_id] : undefined

            return (
              <View key={transaction.id}>
                {index > 0 && <View className="h-px bg-divider-light dark:bg-divider-dark" />}
                <Pressable
                  onPress={() =>
                    router.push(
                      (isTransfer
                        ? `/transfers/${transaction.transfer_id}`
                        : `/transactions/${transaction.id}`) as never
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel={transaction.description}
                  className="active:bg-surface-light dark:active:bg-surface-dark"
                >
                  <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3">
                    {isTransfer ? (
                      <View
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                        className="h-10 w-10 items-center justify-center rounded-row bg-accentTint-light dark:bg-accentTint-dark"
                      >
                        <Ionicons
                          name="swap-horizontal"
                          size={ICON.row}
                          color={isDark ? colors.accent.dark : colors.accentStrong.light}
                        />
                      </View>
                    ) : (
                      <CategoryIcon icon={categoryIconById[transaction.category_id ?? '']} size="sm" />
                    )}

                    <View className="min-w-0 flex-1">
                      <Text
                        className="text-body font-sansSemibold text-ink-light dark:text-ink-dark"
                        numberOfLines={1}
                      >
                        {transaction.description}
                      </Text>
                      <View className="mt-0.5 flex-row items-center gap-1.5">
                        <Text
                          className="shrink text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark"
                          numberOfLines={1}
                        >
                          {isTransfer
                            ? t('transactions.transferLabel')
                            : (categoryName ?? t('transactions.filters.uncategorized'))}
                        </Text>
                        {isTransfer && (
                          <StatusChip label={t('transactions.mobile.transferLinked')} tone="accent" />
                        )}
                        {transaction.is_excluded && (
                          <StatusChip label={t('transactions.excludedLabel')} tone="neutral" />
                        )}
                      </View>
                    </View>

                    <View className="items-end">
                      {/* Magnitude, not the signed amount. The design's feed
                          draws an expense as a plain figure and lets colour
                          and the category line carry the direction — a
                          column of minus signs on every row is noise, since
                          almost every row is an expense. Passed explicitly
                          rather than relying on `Money` to strip it, because
                          `Money` is otherwise obliged to tell the truth
                          about a negative figure. */}
                      <Money
                        agorot={Math.abs(transaction.amount_agorot)}
                        size="row"
                        tone={
                          isTransfer ? 'muted' : transaction.amount_agorot > 0 ? 'positive' : 'default'
                        }
                      />
                      {!isTransfer && (
                        <Text
                          className={`text-meta font-sans ${
                            transaction.is_shared
                              ? 'text-positiveStrong-light dark:text-positiveStrong-dark'
                              : 'text-inkMuted-light dark:text-inkMuted-dark'
                          }`}
                        >
                          {transaction.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              </View>
            )
          })}
        </View>
      </View>
    )
  }

  return (
    <Screen
      scroll={false}
      floatingAction={
        <FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />
      }
    >
      <View className="min-h-[44px] flex-row items-center justify-between">
        <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{t('transactions.title')}</Text>
        <View className="flex-row">
          <Pressable
            onPress={() => setSearchOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isSearchOpen }}
            accessibilityLabel={t('transactions.mobile.searchButton')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name={isSearchOpen ? 'close' : 'search-outline'} size={ICON.hero} color={inkColor} />
          </Pressable>
          <Pressable
            onPress={() => setFilterSheetOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('transactions.mobile.filterButton')}
            className="h-11 w-11 items-center justify-center"
          >
            <Ionicons name="options-outline" size={ICON.hero} color={inkColor} />
            {chips.length > 0 && (
              <View
                className="absolute end-1.5 top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full px-1"
                style={{ backgroundColor: isDark ? colors.accent.dark : colors.accent.light }}
              >
                <Text
                  className="font-heeboBold text-meta"
                  style={{ color: isDark ? colors.hero.light : '#ffffff' }}
                  maxFontSizeMultiplier={1.2}
                >
                  {chips.length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {isSearchOpen && (
        <View className="mb-1 mt-1">
          <Input
            label={t('transactions.filters.searchLabel')}
            placeholder={t('transactions.filters.searchPlaceholder')}
            value={filters.search}
            onChangeText={(search) => setFilters((current) => ({ ...current, search }))}
            autoFocus
          />
        </View>
      )}

      {chips.length > 0 && (
        <View className="mb-3 mt-1 flex-row flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => clearFilter(chip.key)}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              className="min-h-[32px] flex-row items-center gap-1.5 rounded-full bg-hero-light px-3 py-1.5 dark:bg-hero-dark"
            >
              <Text className="text-caption font-sansSemibold text-heroInk-light">{chip.label}</Text>
              <Ionicons name="close" size={ICON.chip} color={colors.heroInk.light} />
            </Pressable>
          ))}
          <Pressable
            onPress={() => setFilters({ ...DEFAULT_TRANSACTION_FILTER_STATE, search: filters.search })}
            accessibilityRole="button"
            className="min-h-[32px] justify-center rounded-full border border-border-light px-3 py-1.5 dark:border-border-dark"
          >
            <Text className="text-caption font-sans text-ink-light dark:text-ink-dark">
              {t('transactions.mobile.resetFilters')}
            </Text>
          </Pressable>
        </View>
      )}

      {/* The categorisation job. Amber, never red: nothing is broken, there
          is simply work outstanding that keeps money out of the budget. */}
      {uncategorized.length > 0 && (
        <Pressable
          testID="uncategorized-strip"
          onPress={() => setFilters((current) => ({ ...current, categoryId: 'uncategorized' }))}
          accessibilityRole="button"
          className="mb-3 mt-1 flex-row items-center gap-3 rounded-card border border-warningBorder-light bg-surfaceMuted-light p-3.5 dark:border-warningBorder-dark dark:bg-surfaceMuted-dark"
        >
          <View className="h-9 w-9 items-center justify-center rounded-row bg-warningTint-light dark:bg-warningTint-dark">
            <Ionicons
              name="pricetag-outline"
              size={ICON.row}
              color={isDark ? colors.warning.dark : colors.warningStrong.light}
            />
          </View>
          <View className="flex-1">
            <Text className="text-bodySm font-sansSemibold text-ink-light dark:text-ink-dark">
              {t('transactions.mobile.uncategorizedTitle', { count: uncategorized.length })}
            </Text>
            <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('transactions.mobile.uncategorizedSubtitle', { amount: formatILS(uncategorizedTotalAgorot) })}
            </Text>
          </View>
          <View className="rounded-control bg-hero-light px-3.5 py-2 dark:bg-hero-dark">
            <Text className="text-caption font-sansSemibold text-heroInk-light">
              {t('transactions.mobile.uncategorizedAction')}
            </Text>
          </View>
        </Pressable>
      )}

      {error ? (
        <ErrorMessage message={t('transactions.errors.generic')} />
      ) : isLoading ? (
        <SkeletonList rows={6} />
      ) : hasNoTransactionsAtAll ? (
        <View className="items-center pt-10">
          <EmptyState iconName="receipt-outline" message={t('transactions.empty')} hint={t('transactions.emptyHint')} />
        </View>
      ) : showNoResults ? (
        <View className="items-center pt-10">
          <EmptyState
            iconName="search-outline"
            message={t('transactions.noResults')}
            actionLabel={t('transactions.filters.clear')}
            onAction={() => setFilters(DEFAULT_TRANSACTION_FILTER_STATE)}
            compact
          />
        </View>
      ) : (
        <FlatList<TransactionDateGroup>
          data={groups}
          keyExtractor={(group) => group.date}
          renderItem={renderGroup}
          showsVerticalScrollIndicator={false}
          contentContainerClassName="pb-28"
        />
      )}

      <TransactionFilterSheet
        visible={isFilterSheetOpen}
        value={filters}
        accounts={accounts}
        categories={categories}
        onApply={(next) => {
          setFilters(next)
          setFilterSheetOpen(false)
        }}
        onClose={() => setFilterSheetOpen(false)}
      />
    </Screen>
  )
}
