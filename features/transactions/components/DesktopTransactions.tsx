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
// Renders at >=1024px on web (app/(app)/transactions/index.tsx picks
// between this and MobileTransactions, at TABLET_LG_BREAKPOINT_PX rather
// than DESKTOP_BREAKPOINT_PX — see that file's own comment) — Checkpoint 4
// (Home + Transactions recompose) moved this screen's own switch earlier,
// making it (with Home) the first real, rendered use of the `tabletLg`
// breakpoint Checkpoint 3 added but nothing yet consumed. Every class below
// is `web:tabletLg:`-scoped, not `web:desktop:`-scoped, for exactly that
// reason — this is the SAME visual language from 1024 up; the only place
// tabletLg and desktop genuinely differ is ContentRail's own rail width
// (280px vs 320px) and outer max-width (1050px vs 1390px), which that
// primitive already parameterizes internally. DesktopTopBar (the shell's
// title band) was extended the same way, per-segment, for this exact
// reason — see its own header comment.
//
// Toolbar: Checkpoint 1 found "a lot of chrome before the first table row"
// (search+3 selects, type+shared controls, the uncategorized banner) — the
// brief asks for a toolbar, not a wall of controls. Every filter stays
// individually visible and directly reachable (collapsing them behind a
// disclosure was considered and rejected — it would touch this screen's
// interaction surface far more than the actual finding calls for); the fix
// is tighter vertical rhythm between the existing rows and a smaller
// uncategorized-queue banner, not fewer controls.

import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useHouseholdMembers } from '@/features/household/hooks/useHouseholdMembers'
import { HouseholdLensControl } from '@/features/household/components/HouseholdLensControl'
import { resolveLensAttributedUserIds, resolveRowEmphasis } from '@/features/household/lib/householdLens'
import { useHouseholdLensStore } from '@/store/householdLensStore'
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
import { RESPONSIVE_PANEL_CLASS } from '@/constants/layout'
import { Screen } from '@/components/ui/Screen'
import { ContentRail, CONTENT_RAIL_WIDTH_CLASS } from '@/components/ui/ContentRail'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { FAB } from '@/components/ui/FAB'
import { StatusChip } from '@/components/ui/StatusChip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'

export function DesktopTransactions() {
  const { t } = useTranslation()
  const router = useRouter()
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  // CP8D — Household Lens. See MobileTransactions.tsx's identical comment.
  const { members } = useHouseholdMembers(householdId)
  const lens = useHouseholdLensStore((s) => s.lens)
  const attributedUserIds = resolveLensAttributedUserIds(lens, members, user?.id)
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
      width="full"
      floatingAction={<FAB accessibilityLabel={t('transactions.addButton')} onPress={() => router.push('/transactions/new')} />}
    >
      {/* Checkpoint 4: `width="full"` (no clamp of its own) rather than
          `wide` — this screen's own outer wrapper below, sized off
          ContentRail's exported CONTENT_RAIL_WIDTH_CLASS, is what caps and
          centers the content now. `wide`'s 820/1150px caps would otherwise
          double-clamp this screen to a narrower width than Shape A's own
          1050/1390px, silently shrinking the rail layout back down. */}
      <View className={CONTENT_RAIL_WIDTH_CLASS}>
        {/* The title, the CSV-import link and the primary action are the
            shell bar's now (components/ui/DesktopTopBar.tsx, tabletLg+ on
            this route specifically — see its own header comment). The
            mockup's own Transactions frame puts exactly those three in its
            68px band. This screen used to draw them again underneath it. */}

        {/* Toolbar architecture pass: search is the primary control, given
            its own visual weight; the three narrowing selects are a clearly
            secondary cluster beside it (previously each select was wrapped
            in its own border+bg box on TOP of Select's own 'row'-variant
            border — a literal double-bordered box every one of the three
            rendered as). Type/shared moved off seven competing Chip pills
            onto two compact SegmentedControls — the exact same component
            and tint language transactions/new.tsx's own expense/income/
            transfer + shared/personal toggles already use, so "filter by
            type" and "set a type" now look like the same product decision,
            not two. Deliberately full-width (spans both the table and
            sidebar columns below, not just the table column) so the summary
            sidebar starts at the same Y as the table it summarizes, instead
            of floating beside the filter row above it.
            Checkpoint 4: `mb-5` → `mb-4` and the row gaps below tightened —
            Checkpoint 1's own finding was chrome density, not missing
            controls, so every field here stays exactly as reachable as
            before; only the vertical rhythm between rows tightened. */}
        <View className="web:tabletLg:mb-4">
          <View className="web:tabletLg:flex-row web:tabletLg:items-start web:tabletLg:gap-3">
          <View className="web:tabletLg:flex-[2]">
            <Input
              label={t('transactions.filters.searchLabel')}
              value={filterState.search}
              onChangeText={(text) => updateFilters({ search: text })}
              placeholder={t('transactions.filters.searchPlaceholder')}
            />
          </View>

          <View className="mb-2 flex-row flex-wrap gap-2 web:tabletLg:mb-0 web:tabletLg:flex-[3] web:tabletLg:flex-nowrap">
            <View className="min-w-[110px] flex-1">
              <Select
                variant="row"
                label={t('transactions.filters.periodLabel')}
                options={periodOptions}
                value={filterState.period}
                onChange={(value) => updateFilters({ period: value as TransactionPeriod })}
                placeholder={t('transactions.filters.periodLabel')}
              />
            </View>
            <View className="min-w-[110px] flex-1">
              <Select
                variant="row"
                label={t('transactions.filters.accountLabel')}
                options={accountOptions}
                value={filterState.accountId ?? 'all'}
                onChange={(value) => updateFilters({ accountId: value === 'all' ? null : value })}
                placeholder={t('transactions.filters.accountLabel')}
              />
            </View>
            <View className="min-w-[110px] flex-1">
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

        {/* The same SegmentedControl (and, for type, the same ink/ink/
            positive/accent tint mapping) transactions/new.tsx's own
            expense/income/transfer + shared/personal toggles already use —
            "filter by type" and "set a type" are the same conceptual
            control everywhere in this app now, not a filter-only Chip row
            that happened to look different. (This file only ever mounts at
            >=1200px — see its own header comment — so no responsive
            fallback is needed here; MobileTransactions.tsx keeps its own
            unrelated Chip-row treatment, which fits that layout better.) */}
        <View className="web:tabletLg:mt-3 web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-4">
          <View className="web:tabletLg:w-[420px]">
            <SegmentedControl
              accessibilityLabel={t('transactions.filters.typeLabel')}
              options={[
                { value: 'all', label: t('transactions.filters.type.all'), tint: 'ink', testID: 'transactions-filter-type-all' },
                { value: 'expense', label: t('transactions.filters.type.expense'), tint: 'ink', testID: 'transactions-filter-type-expense' },
                { value: 'income', label: t('transactions.filters.type.income'), tint: 'positive', testID: 'transactions-filter-type-income' },
                { value: 'transfer', label: t('transactions.filters.type.transfer'), tint: 'accent', testID: 'transactions-filter-type-transfer' },
              ]}
              value={filterState.type}
              onChange={(value) => updateFilters({ type: value })}
            />
          </View>
          <View className="web:tabletLg:w-[280px]">
            <SegmentedControl
              accessibilityLabel={t('transactions.filters.sharedLabel')}
              options={[
                { value: 'all', label: t('transactions.filters.shared.all'), testID: 'transactions-filter-shared-all' },
                { value: 'shared', label: t('transactions.filters.shared.shared'), testID: 'transactions-filter-shared-shared' },
                { value: 'personal', label: t('transactions.filters.shared.personal'), testID: 'transactions-filter-shared-personal' },
              ]}
              value={filterState.shared}
              onChange={(value) => updateFilters({ shared: value })}
            />
          </View>
        </View>
      </View>

      <ContentRail
        className="web:tabletLg:mt-1"
        primary={
          <>
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

          {!isPageLoading && !error && !isSelectionMode && (
            <View className="mb-4 w-[240px]">
              <HouseholdLensControl householdId={householdId} />
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
              existing ones).
              Checkpoint 4: shrunk from a `p-3.5`/`h-8 w-8` icon badge to a
              slimmer strip (`p-2.5`, no separate icon badge fill) — Checkpoint
              1's "a lot of chrome before the first row" finding named this
              banner specifically as reading like a full card. */}
          {!isPageLoading && !error && uncategorizedVisible.length > 0 && (
            <Pressable
              onPress={handleUncategorizedQueuePress}
              accessibilityRole="button"
              className="web:tabletLg:mb-3 web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-2.5 web:tabletLg:rounded-row web:tabletLg:border web:tabletLg:border-warning-light/40 web:tabletLg:bg-surfaceMuted-light web:tabletLg:p-2.5 dark:web:tabletLg:border-warning-dark/40 dark:web:tabletLg:bg-surfaceMuted-dark"
            >
              <Ionicons name="pricetag-outline" size={ICON.row} color={colors.warningStrong[scheme === 'dark' ? 'dark' : 'light']} />
              <View className="web:tabletLg:flex-1">
                <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">
                  {t('transactions.queue.title', { count: uncategorizedVisible.length })}
                </Text>
                <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.queue.subtitle', { amount: formatILS(uncategorizedTotalAgorot) })}
                </Text>
              </View>
              <View className="web:tabletLg:rounded-control web:tabletLg:bg-ink-light web:tabletLg:px-3.5 web:tabletLg:py-2 dark:web:tabletLg:bg-ink-dark">
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
            <View className="web:tabletLg:mb-3">
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
            // viewport heights. `web:tabletLg:flex-1 web:tabletLg:justify-center`
            // (Screen's own content column is already a `flex-1` column, see
            // Screen.tsx) makes this box claim the remaining vertical space
            // below the header and centers its content within it — the
            // available space is used deliberately instead of left as dead
            // canvas beneath a small anchored box. Mobile is untouched: without
            // `web:tabletLg:`, it stays the exact original unscoped "items-center
            // pt-10" box (flex-1/justify-center was deliberately rejected for
            // mobile in an earlier pass — see the dedicated regression test
            // below for why that choice is guarded, not reintroduced here).
            <View className="items-center pt-10 web:tabletLg:flex-1 web:tabletLg:justify-center web:tabletLg:pt-0">
              <View className="web:tabletLg:w-full web:tabletLg:max-w-[520px] web:tabletLg:rounded-card web:tabletLg:border web:tabletLg:border-border-light web:tabletLg:bg-surfaceMuted-light web:tabletLg:px-10 web:tabletLg:py-16 dark:web:tabletLg:border-border-dark dark:web:tabletLg:bg-surfaceMuted-dark">
                {/* Two EmptyState renders, not one — `compact` is a single
                    fixed prop with no responsive variant, and desktop's roomier
                    card calls for the larger icon/spacing `compact={false}`
                    already gives every other full-size empty state in this app,
                    while mobile keeps the exact original compact treatment. */}
                <View className="web:tabletLg:hidden">
                  <EmptyState iconName="receipt-outline" message={t('transactions.empty')} compact />
                </View>
                <View className="hidden web:tabletLg:flex">
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
            <View className={RESPONSIVE_PANEL_CLASS}>
              <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:border-b web:tabletLg:border-divider-light web:tabletLg:pb-2.5 dark:web:tabletLg:border-divider-dark">
                <Text className="web:tabletLg:flex-1 text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.transaction')}
                </Text>
                {/* Checkpoint 4: narrower at tabletLg (130px) than desktop
                    (170px) — the primary column has ~220-290px less room at
                    1024-1199 than at 1200+ (ContentRail's own narrower rail
                    and outer cap), and every fixed column staying at its
                    desktop width squeezed the row's own subtitle (category
                    + date) into truncating. Account names themselves still
                    fit comfortably at 130px; freed width goes back to the
                    row's own text. */}
                <Text className="web:tabletLg:w-[130px] web:desktop:w-[170px] text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.account')}
                </Text>
                <Text className="web:tabletLg:w-[90px] text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.attribution')}
                </Text>
                <Text className="web:tabletLg:w-[130px] text-end text-meta font-sansSemibold tracking-[0.05em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.columns.amount')}
                </Text>
              </View>

              {dateGroups.map((group, groupIndex) => {
                const heading = dateGroupHeading(group.date, today)
                return (
                  <View key={group.date}>
                    {/* Clearer date grouping (product-quality pass): a thin
                        rule ahead of every group but the first breaks a long
                        month into visually distinct day-chunks instead of one
                        continuous scroll where only a small text label marks
                        the boundary. */}
                    <View
                      className={
                        groupIndex === 0
                          ? 'web:tabletLg:mb-1 web:tabletLg:mt-4 web:tabletLg:flex-row web:tabletLg:items-center'
                          : 'web:tabletLg:mb-1 web:tabletLg:mt-5 web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:border-t web:tabletLg:border-divider-light web:tabletLg:pt-4 dark:web:tabletLg:border-divider-dark'
                      }
                    >
                      <Text className="text-meta font-sansSemibold tracking-[0.03em] text-inkMuted-light dark:text-inkMuted-dark">
                        {heading.relativeKey
                          ? `${t(`transactions.mobile.${heading.relativeKey}`)} · ${formatDateDisplay(group.date)}`
                          : formatDateDisplay(group.date)}
                      </Text>
                    </View>

                    {group.transactions.map((item) => {
                      const isTransfer = item.transfer_id !== null
                      const categoryName = item.category_id ? categoryNameById[item.category_id] : undefined
                      const isSelected = selectedIds.has(item.id)
                      // CP8D — see MobileTransactions.tsx's identical comment.
                      const isQuiet = !isTransfer && resolveRowEmphasis(item.payer_id, attributedUserIds) === 'quiet'
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
                                  description: item.description,
                                  state: isSelected ? t('transactions.selection.selected') : t('transactions.selection.notSelected'),
                                })
                              : undefined
                          }
                          className={`web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:gap-3 web:tabletLg:rounded-control web:tabletLg:border-b web:tabletLg:border-divider-light web:tabletLg:px-2 web:tabletLg:py-3 web:tabletLg:-mx-2 web:hover:bg-surface-light/70 dark:web:tabletLg:border-divider-dark dark:web:hover:bg-surface-dark/50 ${
                            isSelectionMode && isSelected ? 'web:tabletLg:bg-surface-light dark:web:tabletLg:bg-surface-dark' : ''
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
                          <View className="web:tabletLg:flex-1">
                            <Text
                              className={
                                isQuiet
                                  ? 'text-body text-inkMuted-light dark:text-inkMuted-dark'
                                  : 'text-body font-medium text-ink-light dark:text-ink-dark'
                              }
                              numberOfLines={1}
                            >
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
                          <Text className="web:tabletLg:w-[130px] web:desktop:w-[170px] text-caption text-inkMuted-light dark:text-inkMuted-dark" numberOfLines={1}>
                            {accountNameById[item.account_id] ?? ''}
                          </Text>
                          <View className="web:tabletLg:w-[90px]">
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
                                ? 'web:tabletLg:w-[130px] text-end text-body font-semibold text-accent-light dark:text-accent-dark'
                                : item.amount_agorot > 0
                                  ? 'web:tabletLg:w-[130px] text-end text-body font-semibold text-positive-light dark:text-positive-dark'
                                  : 'web:tabletLg:w-[130px] text-end text-body font-semibold text-ink-light dark:text-ink-dark'
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
          </>
        }
        rail={
          <View className="web:tabletLg:gap-3.5">
            {/* Right sidebar. Starts at the same Y as the table (the
                toolbar above now spans both columns, not just this one) so
                the summary reads as this exact list's own recap rather than
                a card floating beside the filter row above it. Always
                shown, independent of the list's own empty/loading state:
                the active-rules panel describes the household's rule set,
                not this month's transactions, and a month summary of all
                zeros is a correct (if unremarkable) description of an empty
                month, not a state worth hiding. ContentRail's own rail slot
                already supplies the width/flex-none wrapper — this gap-3.5
                is only the spacing between the two cards below. */}
            <View className={RESPONSIVE_PANEL_CLASS}>
              <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('transactions.summary.title', { count: filteredTransactions.length })}
              </Text>

              {/* The net figure is this card's one answer — given the same
                  visual weight a hero figure gets elsewhere in the app
                  (`figure` scale), not a same-sized third line in a list of
                  four. Financial-good/bad color semantics apply here
                  (unlike a plain per-row expense, which stays neutral ink —
                  see the row-level comment above): a whole period's net IS
                  the kind of good/bad signal those tokens exist for. */}
              <Text
                className={`web:tabletLg:mt-2 text-figure font-heeboBold ${
                  incomeAgorot - expenseAgorot >= 0
                    ? 'text-positive-light dark:text-positive-dark'
                    : 'text-danger-light dark:text-danger-dark'
                }`}
              >
                {formatILS(incomeAgorot - expenseAgorot)}
              </Text>
              <Text className="web:tabletLg:mb-3.5 text-caption text-inkMuted-light dark:text-inkMuted-dark">
                {t('transactions.summary.net')}
              </Text>

              {/* A quick-glance income-vs-expense proportion bar — two
                  segments, no axis/legend needed since the two rows directly
                  below already carry the exact figures. */}
              <View className="web:tabletLg:mb-3.5 web:tabletLg:h-1.5 web:tabletLg:flex-row web:tabletLg:overflow-hidden web:tabletLg:rounded-full web:tabletLg:bg-track-light dark:web:tabletLg:bg-track-dark">
                {incomeAgorot + expenseAgorot > 0 && (
                  <>
                    <View
                      className="web:tabletLg:h-full web:tabletLg:bg-positive-light dark:web:tabletLg:bg-positive-dark"
                      style={{ width: `${(incomeAgorot / (incomeAgorot + expenseAgorot)) * 100}%` }}
                    />
                    <View
                      className="web:tabletLg:h-full web:tabletLg:bg-ink-light/30 dark:web:tabletLg:bg-ink-dark/30"
                      style={{ width: `${(expenseAgorot / (incomeAgorot + expenseAgorot)) * 100}%` }}
                    />
                  </>
                )}
              </View>

              <View className="web:tabletLg:gap-2.5">
                <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
                  <Text className="text-body text-ink-light dark:text-ink-dark">{t('transactions.summary.income')}</Text>
                  <Text className="text-body font-sansSemibold text-positive-light dark:text-positive-dark">
                    {formatILS(incomeAgorot)}
                  </Text>
                </View>
                <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
                  <Text className="text-body text-ink-light dark:text-ink-dark">{t('transactions.summary.expense')}</Text>
                  <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark">{formatILS(expenseAgorot)}</Text>
                </View>
                <View className="web:tabletLg:h-px web:tabletLg:bg-border-light dark:web:tabletLg:bg-border-dark" />
                <View className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                    {t('transactions.summary.personalPortion')}
                  </Text>
                  <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{formatILS(personalAgorot)}</Text>
                </View>
              </View>
            </View>

            {activeRules.length > 0 && (
              <View className={RESPONSIVE_PANEL_CLASS}>
                <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('transactions.rulesPanel.title')}
                </Text>
                <View className="web:tabletLg:mt-3 web:tabletLg:gap-2.5">
                  {activeRules.map((rule) => (
                    <View key={rule.id} className="web:tabletLg:flex-row web:tabletLg:items-center web:tabletLg:justify-between">
                      <Text className="web:tabletLg:flex-1 text-caption text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {t(`categories.rules.field.${rule.field}`)} {t(`categories.rules.operator.${rule.operator}`)} &quot;{rule.value}&quot;
                      </Text>
                      <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
                        {categoryNameById[rule.category_id] ?? ''}
                      </Text>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => router.push('/settings/categories')} accessibilityRole="button" className="web:tabletLg:mt-3">
                  <Text className="text-caption font-sansSemibold text-accent-light dark:text-accent-dark">
                    {t('transactions.rulesPanel.manageLink')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
      />
      </View>
    </Screen>
  )
}
