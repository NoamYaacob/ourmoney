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
// Bulk category selection, matching desktop's "בחירה מרובה"
// (features/transactions/components/DesktopTransactions.tsx) — same
// selection-mode state shape, same transactionSelection.ts helpers, same
// useBulkUpdateTransactionCategory mutation, same transactions.selection.*
// copy. Only the entry point differs: desktop has room for a permanent
// text link above the list; here it's a third icon button next to
// search/filter, matching the row of icon-only actions this header already
// has instead of adding a new visual pattern. A previous version of this
// screen had no selection mode at all, with a comment claiming otherwise —
// this is the fix, not a rewrite of the comment.

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
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { HouseholdLensControl } from '@/features/household/components/HouseholdLensControl'
import { resolveLensAttributedUserIds, resolveRowEmphasis } from '@/features/household/lib/householdLens'
import { useHouseholdLensStore } from '@/store/householdLensStore'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useUncategorizedTransactions } from '@/features/budgets/hooks/useUncategorizedTransactions'
import { useBulkUpdateTransactionCategory } from '@/features/transactions/hooks/useBulkUpdateTransactionCategory'
import {
  buildTransactionQueryFilters,
  DEFAULT_TRANSACTION_FILTER_STATE,
  filterTransactionsLocally,
  isDefaultTransactionFilterState,
  parseTransactionFilterParams,
  type TransactionFilterState,
} from '@/features/transactions/lib/transactionFilters'
import { intersectWithVisible, selectAllVisible, toggleSelection } from '@/features/transactions/lib/transactionSelection'
import { groupTransactionsByDate, dateGroupHeading } from '@/features/transactions/lib/groupByDate'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { TransactionFilterSheet } from '@/features/transactions/components/TransactionFilterSheet'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { formatILS } from '@/lib/money/format'
import { HIT_SLOP } from '@/constants/accessibility'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { FAB } from '@/components/ui/FAB'
import { Money } from '@/components/ui/Money'
import { SectionLabel } from '@/components/ui/SectionLabel'
import { StatusChip } from '@/components/ui/StatusChip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
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
  const accentColor = isDark ? colors.accent.dark : colors.accent.light

  const { user } = useAuth()
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  // CP8D — Household Lens. `attributedUserIds` is the one real, truthful
  // attribution set (from transactions.payer_id via the shared lens model,
  // never a per-screen re-derivation) resolveRowEmphasis checks each row
  // against below.
  const { members } = useHouseholdMembers(householdId)
  const lens = useHouseholdLensStore((s) => s.lens)
  const attributedUserIds = resolveLensAttributedUserIds(lens, members, user?.id)
  const [filters, setFilters] = useState<TransactionFilterState>(() => parseTransactionFilterParams(params))
  const [isFilterSheetOpen, setFilterSheetOpen] = useState(false)
  const [isSearchOpen, setSearchOpen] = useState(false)

  // Bulk categorization selection mode — same shape as
  // DesktopTransactions.tsx's identical state (see that file's own comment
  // for why this is plain component state, not route params).
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null)
  const bulkUpdateCategory = useBulkUpdateTransactionCategory(householdId)

  const queryFilters = buildTransactionQueryFilters(filters)
  const { transactions, isLoading, error, hasData, refetch } = useTransactions(householdId, queryFilters)
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

  // Transfer rows are never selectable (migration 008, ADR-035 — see
  // DesktopTransactions.tsx's identical `visibleIds` for the full
  // reasoning: no category to bulk-assign, and the RLS-backed RPC would
  // reject the write anyway).
  const visibleIds = filtered.filter((txn) => txn.transfer_id === null).map((txn) => txn.id)

  // Same policy as desktop: any filter change clears the whole selection
  // rather than trying to reconcile which selected ids are still visible —
  // see DesktopTransactions.tsx's identical guard for why "clear outright"
  // is the only version of this that can't silently keep a
  // no-longer-visible id selected.
  const filterSignature = JSON.stringify(filters)
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature)
  if (filterSignature !== lastFilterSignature) {
    setLastFilterSignature(filterSignature)
    if (selectedIds.size > 0) setSelectedIds(new Set())
  }

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

  // Identical to DesktopTransactions.tsx's handlers of the same names — see
  // that file for the reasoning behind each (never auto-selecting on entry,
  // clearing vs. keeping the selection on partial/full failure, etc.).
  function handleEnterSelectionMode() {
    setBulkResultMessage(null)
    setIsSelectionMode(true)
  }

  function handleCancelSelection() {
    setIsSelectionMode(false)
    setSelectedIds(new Set())
    setBulkResultMessage(null)
  }

  function handleSelectAll() {
    setSelectedIds(selectAllVisible(visibleIds))
  }

  function handleDeselectAll() {
    setSelectedIds(new Set())
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) => toggleSelection(prev, id))
  }

  async function handleBulkCategoryChange(value: string) {
    if (!householdId || bulkUpdateCategory.isPending) return
    const categoryId = value === 'uncategorized' ? null : value
    const idsToUpdate = intersectWithVisible(selectedIds, visibleIds)
    if (idsToUpdate.length === 0) return

    setBulkResultMessage(null)
    try {
      const result = await bulkUpdateCategory.mutateAsync({ householdId, transactionIds: idsToUpdate, categoryId })
      if (result.missingIds.length === 0) {
        setBulkResultMessage(t('transactions.selection.successMessage', { count: result.updatedIds.length }))
        setSelectedIds(new Set())
        setIsSelectionMode(false)
      } else {
        setBulkResultMessage(
          t('transactions.selection.partialMessage', { updated: result.updatedIds.length, total: idsToUpdate.length })
        )
        setSelectedIds(new Set(result.missingIds))
      }
    } catch {
      setBulkResultMessage(t('transactions.selection.errorMessage'))
    }
  }

  function handleUncategorizedStripPress() {
    if (uncategorized.length === 0) return
    setFilters((current) => ({ ...current, categoryId: 'uncategorized' }))
    handleEnterSelectionMode()
  }

  const bulkCategoryOptions = [
    { value: 'uncategorized', label: t('transactions.filters.uncategorized') },
    ...categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) })),
  ]

  if (isHouseholdLoading) {
    return (
      <Screen>
        <SkeletonList rows={5} />
      </Screen>
    )
  }

  // Keyed on `hasData` (has this query ever resolved with data), not `error`
  // — `hasData` implies `!isLoading` (a query can't be pending once it has
  // data), and unlike `!error` it stays true through a background refetch
  // failure, so a household's real "no transactions" / "no results" state
  // does not flip back to a loading-looking limbo just because a later
  // background refetch failed after the list had already loaded correctly.
  const hasNoTransactionsAtAll = hasData && transactions.length === 0 && isDefaultTransactionFilterState(filters)
  const showNoResults = hasData && filtered.length === 0 && !hasNoTransactionsAtAll

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
            const isSelected = selectedIds.has(transaction.id)
            // CP8D — never de-emphasizes a transfer (it has no single
            // "owner" to begin with) or a row whose real payer is unknown;
            // see resolveRowEmphasis's own header for the full rule.
            const isQuiet = !isTransfer && resolveRowEmphasis(transaction.payer_id, attributedUserIds) === 'quiet'

            // A transfer row is never selectable (see visibleIds above) — in
            // selection mode it neither toggles nor navigates, matching
            // DesktopTransactions.tsx's identical guard.
            const handlePress = isSelectionMode
              ? isTransfer
                ? undefined
                : () => handleToggleRow(transaction.id)
              : () =>
                  router.push(
                    (isTransfer
                      ? `/transfers/${transaction.transfer_id}`
                      : `/transactions/${transaction.id}`) as never
                  )

            return (
              <View key={transaction.id}>
                {index > 0 && <View className="h-px bg-divider-light dark:bg-divider-dark" />}
                <Pressable
                  onPress={handlePress}
                  disabled={isSelectionMode && isTransfer ? true : undefined}
                  accessibilityRole={isSelectionMode && !isTransfer ? 'checkbox' : 'button'}
                  accessibilityState={isSelectionMode && !isTransfer ? { checked: isSelected } : undefined}
                  // Final merge gate, blocker 1 (P0-4 residual): accessibilityState's
                  // object form is silently dropped by react-native-web's own DOM-prop
                  // whitelist — it never reaches aria-checked on web, the same gap
                  // SegmentedControl.tsx's own P0-4 fix already closed elsewhere. A raw
                  // aria-checked prop survives that whitelist and is forwarded straight
                  // to the DOM attribute; undefined outside selection mode so a plain
                  // "button" row never gets a stray aria-checked.
                  aria-checked={isSelectionMode && !isTransfer ? isSelected : undefined}
                  accessibilityLabel={
                    isSelectionMode && !isTransfer
                      ? t('transactions.selection.rowLabel', {
                          description: transaction.description,
                          state: isSelected ? t('transactions.selection.selected') : t('transactions.selection.notSelected'),
                        })
                      : transaction.description
                  }
                  className={`active:bg-surface-light dark:active:bg-surface-dark ${
                    isSelectionMode && isSelected ? 'bg-surface-light dark:bg-surface-dark' : ''
                  }`}
                >
                  <View className="min-h-[56px] flex-row items-center gap-3 px-4 py-3">
                    {isSelectionMode && !isTransfer && (
                      <Ionicons
                        name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={ICON.hero}
                        color={isSelected ? accentColor : mutedColor}
                      />
                    )}
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
                        className={
                          isQuiet
                            ? 'text-body font-sans text-inkMuted-light dark:text-inkMuted-dark'
                            : 'text-body font-sansSemibold text-ink-light dark:text-ink-dark'
                        }
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
            // RRR §16 P0-4: see SegmentedControl.tsx's note.
            aria-expanded={isSearchOpen}
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
          {!isSelectionMode && filtered.length > 0 && (
            <Pressable
              onPress={handleEnterSelectionMode}
              accessibilityRole="button"
              accessibilityLabel={t('transactions.selection.enterButton')}
              hitSlop={HIT_SLOP}
              className="h-11 w-11 items-center justify-center"
            >
              <Ionicons name="checkmark-circle-outline" size={ICON.hero} color={inkColor} />
            </Pressable>
          )}
        </View>
      </View>

      {!isSelectionMode && (
        <View className="mb-3 mt-1 w-[240px]">
          <HouseholdLensControl householdId={householdId} />
        </View>
      )}

      {isSelectionMode && (
        <View className="mb-3 mt-1">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-caption font-semibold text-ink-light dark:text-ink-dark">
              {t('transactions.selection.selectedCount', { count: selectedIds.size })}
            </Text>
            <Pressable onPress={handleCancelSelection} accessibilityRole="button" hitSlop={HIT_SLOP}>
              <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                {t('transactions.selection.cancel')}
              </Text>
            </Pressable>
          </View>

          <View className="flex-row flex-wrap items-center gap-3">
            <Pressable onPress={handleSelectAll} accessibilityRole="button" hitSlop={HIT_SLOP}>
              <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                {t('transactions.selection.selectAll')}
              </Text>
            </Pressable>
            <Pressable onPress={handleDeselectAll} accessibilityRole="button" hitSlop={HIT_SLOP}>
              <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                {t('transactions.selection.deselectAll')}
              </Text>
            </Pressable>
          </View>

          {selectedIds.size > 0 && (
            <View className="mt-3">
              {bulkUpdateCategory.isPending ? (
                <Button title={t('transactions.selection.changeCategoryButton')} loading disabled onPress={() => {}} />
              ) : (
                <Select
                  variant="box"
                  label={t('transactions.selection.changeCategoryButton')}
                  options={bulkCategoryOptions}
                  value={null}
                  onChange={(value) => void handleBulkCategoryChange(value)}
                  placeholder={t('transactions.form.categoryPlaceholder')}
                  sheetTitle={t('transactions.form.categorySheetTitle')}
                />
              )}
            </View>
          )}
        </View>
      )}

      {/* Deliberately rendered outside the isSelectionMode block above — see
          DesktopTransactions.tsx's identical comment: a fully-successful
          bulk update exits selection mode as part of the same state change
          that produces this message. */}
      {bulkResultMessage && (
        <Text className="mb-3 text-caption text-inkMuted-light dark:text-inkMuted-dark">{bulkResultMessage}</Text>
      )}

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
          onPress={handleUncategorizedStripPress}
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

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : !hasData ? (
        <ErrorMessage message={t('transactions.errors.generic')} onRetry={refetch} />
      ) : error ? (
        <View className="mb-3">
          <ErrorMessage message={t('transactions.errors.generic')} onRetry={refetch} />
        </View>
      ) : null}
      {!hasData ? null : hasNoTransactionsAtAll ? (
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
