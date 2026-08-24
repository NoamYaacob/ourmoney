// Desktop Claude Design pass. Rebuilt from the plain single-column row list
// (extracted verbatim from the pre-redesign screen) to match the approved
// `OurMoney - Desktop.dc.html` Transactions screen: a header with a primary
// "add transaction" action, a date-grouped table-style feed with an
// uncategorized-transactions queue banner and a rule/installment provenance
// sub-line per row, paired with a 300px sidebar (this view's income/expense/
// net summary, and the household's active categorization rules).
//
// Every piece of business logic below is unchanged from the pre-redesign
// screen: route-param filter state (search/period/account/category/type/
// shared), the server/client filter split, bulk-selection + categorization
// (including partial-failure and error handling), transfer-row exclusion
// from selection, and the true-empty vs. no-results distinction. Only what
// renders and how it's arranged changed.
//
// Renders only at >=1200px on web (app/(app)/transactions/index.tsx picks
// between this and MobileTransactions), so every class below is
// desktop-scoped — this component is simply never mounted at any other
// width.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useCategoryRules } from '@/features/categories/hooks/useCategoryRules'
import { useInstallmentPlans } from '@/features/installments/hooks/useInstallmentPlans'
import { useBulkUpdateTransactionCategory } from '@/features/transactions/hooks/useBulkUpdateTransactionCategory'
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
import { intersectWithVisible, selectAllVisible, toggleSelection } from '@/features/transactions/lib/transactionSelection'
import { groupTransactionsByDate, dateGroupHeading } from '@/features/transactions/lib/groupByDate'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { formatILS } from '@/lib/money/format'
import { formatDateDisplay } from '@/lib/dates/format'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { HIT_SLOP } from '@/constants/accessibility'
import { DESKTOP_CARD_CLASS } from '@/constants/layout'
import { Screen } from '@/components/ui/Screen'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Chip } from '@/components/ui/Chip'
import { Button } from '@/components/ui/Button'
import { FAB } from '@/components/ui/FAB'
import { StatusChip } from '@/components/ui/StatusChip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'

const TYPE_FILTER_VALUES: TransactionTypeFilter[] = ['all', 'expense', 'income', 'transfer']
const SHARED_FILTER_VALUES: TransactionSharedFilter[] = ['all', 'shared', 'personal']

export function DesktopTransactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { accounts } = useAccounts(householdId)
  const { categories } = useCategories(householdId)
  const { rules } = useCategoryRules(householdId)
  const { plans: installmentPlans } = useInstallmentPlans(householdId)
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name_he]))
  const categoryIconById = Object.fromEntries(categories.map((c) => [c.id, c.icon]))
  const accountNameById = Object.fromEntries(accounts.map((a) => [a.id, a.name]))
  const categoryRuleById = Object.fromEntries(rules.map((r) => [r.id, r]))
  const installmentPlanById = Object.fromEntries(installmentPlans.map((p) => [p.id, p]))

  // Bulk categorization selection mode — plain component state, not route
  // params like the filter state: selection is ephemeral UI state with no
  // reason to survive navigation or be shareable/bookmarkable.
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null)
  const bulkUpdateCategory = useBulkUpdateTransactionCategory(householdId)

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

  // Selection semantics with filters (chosen policy, documented): clear the
  // entire selection whenever any filter/search dimension changes, rather
  // than trying to reconcile "keep ids still present." Reconciling
  // correctly requires the visible-set-changed detection to be exhaustive
  // (every filter dimension, every edge case) — a single bug there would
  // silently let a stale, no-longer-visible id survive selected, which is
  // exactly the "hidden dangerous selection" this milestone says to avoid.
  // Clearing outright can never have that failure mode.
  //
  // Adjusted during rendering, not useEffect — the same one-time/guarded
  // "adjust state in response to a changed signal" pattern already
  // established in this codebase (transactions/[id].tsx's
  // loadedTransactionId guard, settings/categories.tsx's
  // consumedEditRuleId guard), which is also what this codebase's React
  // Compiler lint rule (react-hooks/set-state-in-effect) requires instead
  // of a synchronous setState inside a useEffect body.
  const filterSignature = `${filterState.search}|${filterState.period}|${filterState.accountId}|${filterState.categoryId}|${filterState.type}|${filterState.shared}`
  const [lastFilterSignature, setLastFilterSignature] = useState(filterSignature)
  if (filterSignature !== lastFilterSignature) {
    setLastFilterSignature(filterSignature)
    if (selectedIds.size > 0) setSelectedIds(new Set())
  }

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
  const { transactions, isLoading, error, hasData, refetch } = useTransactions(householdId, serverFilters)
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

  // Transfer rows are excluded from the selectable set entirely (migration
  // 008, ADR-035): a transfer leg has no category to bulk-assign, and the
  // RLS tightening that backs the atomic edit/delete RPCs would reject the
  // write anyway (transactions_update's USING clause excludes
  // transfer_id IS NOT NULL rows) — better to never offer the selection in
  // the first place than to let a user select a row a submit can't touch.
  const visibleIds = filteredTransactions.filter((txn) => txn.transfer_id === null).map((txn) => txn.id)

  // The mockup's "6 תנועות מחכות לסיווג" queue banner and "החודש" sidebar
  // summary both read from exactly what's currently listed below (the same
  // filteredTransactions the FlatList-equivalent feed renders) — so the
  // sidebar numbers can never disagree with what the household is actually
  // looking at. With the screen's own default filters (current month, every
  // account/category) that's the household's whole month, matching the
  // mockup's own framing; narrowing a filter narrows the sidebar with it,
  // which is the correct behavior, not a divergence from it.
  const nonTransferVisible = filteredTransactions.filter((txn) => txn.transfer_id === null)
  const uncategorizedVisible = nonTransferVisible.filter((txn) => txn.category_id === null)
  const uncategorizedTotalAgorot = uncategorizedVisible.reduce((sum, txn) => sum + Math.abs(txn.amount_agorot), 0)
  const incomeAgorot = nonTransferVisible.reduce((sum, txn) => (txn.amount_agorot > 0 ? sum + txn.amount_agorot : sum), 0)
  const expenseAgorot = nonTransferVisible.reduce(
    (sum, txn) => (txn.amount_agorot < 0 ? sum + Math.abs(txn.amount_agorot) : sum),
    0
  )
  const personalAgorot = nonTransferVisible.reduce(
    (sum, txn) => (!txn.is_shared ? sum + Math.abs(txn.amount_agorot) : sum),
    0
  )
  const activeRules = rules.filter((rule) => rule.is_active).slice(0, 3)

  function handleEnterSelectionMode() {
    setBulkResultMessage(null)
    setIsSelectionMode(true)
    // Deliberately does not select anything — entering selection mode is
    // never itself a selecting action.
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
    // Belt-and-suspenders on top of the reconciliation effect above: the
    // actual write only ever targets ids that are ALSO in the current
    // filtered result set, computed at the exact moment of submission —
    // see intersectWithVisible's own header comment.
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
        // Failed rows must not disappear from selection as if they
        // succeeded — only the confirmed-updated ids are cleared;
        // everything the UPDATE didn't touch stays selected so the user
        // can see exactly what's left and retry.
        setBulkResultMessage(
          t('transactions.selection.partialMessage', { updated: result.updatedIds.length, total: idsToUpdate.length })
        )
        setSelectedIds(new Set(result.missingIds))
      }
    } catch {
      // The whole atomic UPDATE statement failed — nothing changed, so the
      // full original selection is left exactly as it was (not cleared).
      setBulkResultMessage(t('transactions.selection.errorMessage'))
    }
  }

  function handleUncategorizedQueuePress() {
    if (uncategorizedVisible.length === 0) return
    updateFilters({ categoryId: 'uncategorized' })
    handleEnterSelectionMode()
  }

  const bulkCategoryOptions = [
    { value: 'uncategorized', label: t('transactions.filters.uncategorized') },
    ...categories.map((c) => ({ value: c.id, label: c.name_he, iconName: categoryIconName(c.icon) })),
  ]

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

  const today = localDateString()
  const dateGroups = groupTransactionsByDate(filteredTransactions)

  return (
    <Screen
      scroll={false}
      width="wide"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      {/* The title, the CSV-import link and the primary action are the
          shell bar's on desktop now (components/ui/DesktopTopBar.tsx) — the
          mockup's own Transactions frame puts exactly those three in its
          68px band. This screen used to draw them again underneath it. */}

      <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-5">
        <View className="web:desktop:flex-1">
          {/* Desktop Visual/Responsive Design pass: search + the 3 dropdown
              filters read as a mobile filter panel stacked vertically — on a
              wide desktop viewport they fit comfortably in one row instead.
              Search gets more of the row (`flex-[2]`) than the 3 selects
              combined (`flex-[3]` on their wrapper, `flex-1` each), and the
              whole thing stops wrapping (`flex-nowrap`) once there's room.
              Mobile/tablet keep the exact original stacked layout. */}
          <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-3">
            <View className="web:desktop:flex-[2]">
              <Input
                label={t('transactions.filters.searchLabel')}
                value={filterState.search}
                onChangeText={(text) => updateFilters({ search: text })}
                placeholder={t('transactions.filters.searchPlaceholder')}
              />
            </View>

            <View className="mb-2 flex-row flex-wrap gap-2 web:desktop:mb-0 web:desktop:flex-[3] web:desktop:flex-nowrap">
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
          </View>

          {/* Desktop Visual/Responsive Design pass: the two chip rows (type,
              shared/personal) are secondary filters — combined into one denser
              row at desktop with a small vertical separator between the two
              groups, instead of two full rows each claiming their own line.
              Mobile/tablet keep the original two stacked rows. */}
          <View className="web:desktop:flex-row web:desktop:flex-wrap web:desktop:items-center web:desktop:gap-3">
            <View className="mb-2 flex-row flex-wrap gap-2 web:desktop:mb-4">
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
            <View className="hidden web:desktop:mb-4 web:desktop:flex web:desktop:h-5 web:desktop:w-px web:desktop:bg-border-light dark:web:desktop:bg-border-dark" />
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
          </View>

          {!isPageLoading && !error && !isSelectionMode && (
            <View className="mb-4 flex-row items-center justify-between web:flex-row">
              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('transactions.filters.resultCount', { count: filteredTransactions.length })}
              </Text>
              <View className="flex-row items-center gap-3">
                {isFilterActive && (
                  <Pressable onPress={clearFilters} accessibilityRole="button">
                    <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                      {t('transactions.filters.clear')}
                    </Text>
                  </Pressable>
                )}
                {filteredTransactions.length > 0 && (
                  <Pressable onPress={handleEnterSelectionMode} accessibilityRole="button" hitSlop={HIT_SLOP}>
                    <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                      {t('transactions.selection.enterButton')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {isSelectionMode && (
            <View className="mb-4">
              <View className="mb-2 flex-row items-center justify-between web:flex-row">
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

          {/* Deliberately rendered outside the isSelectionMode block above: a
              fully-successful bulk update exits selection mode as part of the
              same state change that produces this message, so gating the
              message on isSelectionMode would hide it at the exact moment it
              needs to be seen. */}
          {bulkResultMessage && (
            <Text className="mb-4 text-caption text-inkMuted-light dark:text-inkMuted-dark">{bulkResultMessage}</Text>
          )}

          {/* Uncategorized-transactions queue banner — the mockup's own
              "6 תנועות מחכות לסיווג" callout. Pressing it both narrows to the
              uncategorized filter and enters selection mode, the same two
              real capabilities this screen already has (no new mutation, no
              invented "auto-classify" flow — just the fastest path through
              existing ones). */}
          {!isPageLoading && !error && uncategorizedVisible.length > 0 && (
            <Pressable
              onPress={handleUncategorizedQueuePress}
              accessibilityRole="button"
              className="web:desktop:mb-3 web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:rounded-hero web:desktop:border web:desktop:border-warning-light/40 web:desktop:bg-surfaceMuted-light web:desktop:p-3.5 dark:web:desktop:border-warning-dark/40 dark:web:desktop:bg-surfaceMuted-dark"
            >
              <View className="web:desktop:h-8 web:desktop:w-8 web:desktop:items-center web:desktop:justify-center web:desktop:rounded-control web:desktop:bg-warningTint-light dark:web:desktop:bg-warningTint-dark">
                <Ionicons name="pricetag-outline" size={ICON.row} color={colors.warningStrong[scheme === 'dark' ? 'dark' : 'light']} />
              </View>
              <View className="web:desktop:flex-1">
                <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                  {t('transactions.queue.title', { count: uncategorizedVisible.length })}
                </Text>
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.queue.subtitle', { amount: formatILS(uncategorizedTotalAgorot) })}
                </Text>
              </View>
              <View className="web:desktop:rounded-control web:desktop:bg-ink-light web:desktop:px-3.5 web:desktop:py-2 dark:web:desktop:bg-ink-dark">
                <Text className="text-caption font-sansSemibold text-surface-light dark:text-surface-dark">
                  {t('transactions.queue.button')}
                </Text>
              </View>
            </Pressable>
          )}

          {isPageLoading ? (
            <SkeletonList rows={5} />
          ) : !hasData ? (
            <ErrorMessage message={t('transactions.errors.generic')} onRetry={refetch} />
          ) : error ? (
            <View className="web:desktop:mb-3">
              <ErrorMessage message={t('transactions.errors.generic')} onRetry={refetch} />
            </View>
          ) : null}
          {isPageLoading || !hasData ? null : showTrueEmpty ? (
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
            <View className={DESKTOP_CARD_CLASS}>
              <View className="web:desktop:flex-row web:desktop:items-center web:desktop:border-b web:desktop:border-divider-light web:desktop:pb-2.5 dark:web:desktop:border-divider-dark">
                <Text className="web:desktop:flex-1 text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.transaction')}
                </Text>
                <Text className="web:desktop:w-[150px] text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.category')}
                </Text>
                <Text className="web:desktop:w-[120px] text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.account')}
                </Text>
                <Text className="web:desktop:w-[90px] text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.attribution')}
                </Text>
                <Text className="web:desktop:w-[110px] text-end text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.amount')}
                </Text>
              </View>

              {dateGroups.map((group) => {
                const heading = dateGroupHeading(group.date, today)
                return (
                  <View key={group.date}>
                    <Text className="web:desktop:mt-3 web:desktop:mb-1 text-meta font-sansSemibold text-inkMuted-light dark:text-inkMuted-dark">
                      {heading.relativeKey
                        ? `${t(`transactions.mobile.${heading.relativeKey}`)} · ${formatDateDisplay(group.date)}`
                        : formatDateDisplay(group.date)}
                    </Text>

                    {group.transactions.map((item) => {
                      const isTransfer = item.transfer_id !== null
                      const categoryName = item.category_id ? categoryNameById[item.category_id] : undefined
                      const isSelected = selectedIds.has(item.id)
                      const matchedRule = item.matched_rule_id ? categoryRuleById[item.matched_rule_id] : undefined
                      const installmentPlan = item.installment_plan_id ? installmentPlanById[item.installment_plan_id] : undefined

                      let subtitle: string
                      if (isTransfer) {
                        subtitle = `${t('transactions.transferLabel')} · ${formatDateDisplay(item.txn_date)}`
                      } else if (installmentPlan && item.installment_index !== null) {
                        const remainingAgorot = installmentPlan.total_agorot - installmentPlan.monthly_agorot * item.installment_index
                        subtitle = t('transactions.installmentProgress', {
                          index: item.installment_index,
                          count: installmentPlan.installment_count,
                          amount: formatILS(remainingAgorot),
                        })
                      } else if (matchedRule) {
                        subtitle = `${t('transactions.detail.categorizedByRule')} “${matchedRule.value}”`
                      } else {
                        subtitle = categoryName ? `${categoryName} · ${formatDateDisplay(item.txn_date)}` : formatDateDisplay(item.txn_date)
                      }
                      if (!isTransfer && !item.is_shared) subtitle += ` · ${t('transactions.form.personal')}`

                      // A transfer row is never selectable (see visibleIds above) —
                      // in selection mode it neither toggles nor navigates, so a tap
                      // can't silently exit selection mode or offer an action that
                      // would fail server-side.
                      const handlePress = isSelectionMode
                        ? isTransfer
                          ? undefined
                          : () => handleToggleRow(item.id)
                        : () => router.push(isTransfer ? `/transfers/${item.transfer_id}` : `/transactions/${item.id}`)

                      return (
                        <Pressable
                          key={item.id}
                          onPress={handlePress}
                          // undefined, not a bare boolean, when not disabled — Pressable
                          // merges a literal `disabled` prop (even `false`) into
                          // accessibilityState (busy/disabled/expanded/selected all
                          // appear), which would change every ordinary row's
                          // accessibilityState shape too, not just transfer rows.
                          disabled={isSelectionMode && isTransfer ? true : undefined}
                          accessibilityRole={isSelectionMode && !isTransfer ? 'checkbox' : 'button'}
                          accessibilityState={isSelectionMode && !isTransfer ? { checked: isSelected } : undefined}
                          accessibilityLabel={
                            isSelectionMode && !isTransfer
                              ? t('transactions.selection.rowLabel', {
                                  description: item.description,
                                  state: isSelected ? t('transactions.selection.selected') : t('transactions.selection.notSelected'),
                                })
                              : undefined
                          }
                          className={`web:desktop:flex-row web:desktop:items-center web:desktop:gap-3 web:desktop:border-b web:desktop:border-divider-light web:desktop:py-2.5 dark:web:desktop:border-divider-dark ${
                            isSelectionMode && isSelected ? 'web:desktop:bg-surface-light dark:web:desktop:bg-surface-dark' : ''
                          }`}
                        >
                          {isSelectionMode && !isTransfer && (
                            <Ionicons
                              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                              size={ICON.nav}
                              color={isSelected ? accentColor : mutedColor}
                            />
                          )}
                          {isTransfer ? (
                            <View
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                              className="h-8 w-8 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark"
                            >
                              <Ionicons name="swap-horizontal" size={ICON.row} color={accentColor} />
                            </View>
                          ) : (
                            <CategoryIcon icon={item.category_id ? categoryIconById[item.category_id] : undefined} size="sm" />
                          )}
                          <View className="web:desktop:flex-1">
                            <Text className="text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                              {item.description}
                            </Text>
                            <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                              {subtitle}
                            </Text>
                            {item.is_excluded && (
                              <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                                {t('transactions.excludedLabel')}
                              </Text>
                            )}
                          </View>
                          <Text className="web:desktop:w-[150px] text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                            {isTransfer ? t('transactions.transferLabel') : (categoryName ?? '')}
                          </Text>
                          <Text className="web:desktop:w-[120px] text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                            {accountNameById[item.account_id] ?? ''}
                          </Text>
                          <View className="web:desktop:w-[90px]">
                            {!isTransfer && (
                              <StatusChip
                                label={item.is_shared ? t('transactions.form.shared') : t('transactions.form.personal')}
                                tone={item.is_shared ? 'accent' : 'neutral'}
                              />
                            )}
                          </View>
                          <Text
                            className={
                              isTransfer
                                ? 'web:desktop:w-[110px] text-end text-body font-medium text-accent-light dark:text-accent-dark'
                                : item.amount_agorot > 0
                                  ? 'web:desktop:w-[110px] text-end text-body font-medium text-positive-light dark:text-positive-dark'
                                  : 'web:desktop:w-[110px] text-end text-body font-medium text-ink-light dark:text-ink-dark'
                            }
                          >
                            {formatILS(item.amount_agorot)}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )
              })}
            </View>
          )}
        </View>

        {/* Right sidebar — desktop only. Always shown, independent of the
            list's own empty/loading state: the active-rules panel describes
            the household's rule set, not this month's transactions, and a
            month summary of all zeros is a correct (if unremarkable)
            description of an empty month, not a state worth hiding. */}
        <View className="web:desktop:w-[300px] web:desktop:flex-none web:desktop:gap-3.5">
            <View className={DESKTOP_CARD_CLASS}>
              <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('transactions.summary.title', { count: filteredTransactions.length })}
              </Text>
              <View className="web:desktop:mt-3.5 web:desktop:gap-2.5">
                <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
                  <Text className="text-body text-ink-light dark:text-ink-dark">{t('transactions.summary.income')}</Text>
                  <Text className="text-body font-sansSemibold text-positive-light dark:text-positive-dark">
                    {formatILS(incomeAgorot)}
                  </Text>
                </View>
                <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
                  <Text className="text-body text-ink-light dark:text-ink-dark">{t('transactions.summary.expense')}</Text>
                  <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{formatILS(expenseAgorot)}</Text>
                </View>
                <View className="web:desktop:h-px web:desktop:bg-border-light dark:web:desktop:bg-border-dark" />
                <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
                  <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{t('transactions.summary.net')}</Text>
                  <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                    {formatILS(incomeAgorot - expenseAgorot)}
                  </Text>
                </View>
                <View className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {t('transactions.summary.personalPortion')}
                  </Text>
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{formatILS(personalAgorot)}</Text>
                </View>
              </View>
            </View>

            {activeRules.length > 0 && (
              <View className={DESKTOP_CARD_CLASS}>
                <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.rulesPanel.title')}
                </Text>
                <View className="web:desktop:mt-3 web:desktop:gap-2.5">
                  {activeRules.map((rule) => (
                    <View key={rule.id} className="web:desktop:flex-row web:desktop:items-center web:desktop:justify-between">
                      <Text className="web:desktop:flex-1 text-caption text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {t(`categories.rules.field.${rule.field}`)} {t(`categories.rules.operator.${rule.operator}`)} &quot;{rule.value}&quot;
                      </Text>
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                        {categoryNameById[rule.category_id] ?? ''}
                      </Text>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => router.push('/settings/categories')} accessibilityRole="button" className="web:desktop:mt-3">
                  <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                    {t('transactions.rulesPanel.manageLink')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
      </View>
    </Screen>
  )
}
