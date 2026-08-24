// One screen for M6 (D4) — monthly overview, per-category allocation
// editor, and the uncategorized-transactions queue. Category rules live in
// settings/categories.tsx alongside category management itself.
//
// Design Phase 3: visual language brought in line with Dashboard/Add
// Transaction (Phase 1/2) — MonthNavigator instead of a hand-rolled prev/
// next row, a hero summary card, CategoryIcon instead of raw emoji, one
// enclosing Card per list (Divider-separated rows) instead of one bordered
// Card per row. Every hook call, mutation payload, and state-clearing
// behavior below is unchanged from Phase 1 — this is presentation only.

import { useState } from 'react'
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHousehold } from '@/features/household/hooks/useHousehold'
import { useCategories } from '@/features/categories/hooks/useCategories'
import { useBudgetProgress } from '@/features/budgets/hooks/useBudgetProgress'
import { useSaveBudgetAllocations } from '@/features/budgets/hooks/useSaveBudgetAllocations'
import { useUncategorizedTransactions } from '@/features/budgets/hooks/useUncategorizedTransactions'
import { useTransactions } from '@/features/transactions/hooks/useTransactions'
import { useRecurringTransactions } from '@/features/recurring/hooks/useRecurringTransactions'
import { MonthNavigator } from '@/features/budgets/components/MonthNavigator'
import { CopyPreviousMonthBudgetModal } from '@/features/budgets/components/CopyPreviousMonthBudgetModal'
import { planCopyPreviousMonthBudget } from '@/features/budgets/lib/copyPreviousMonthBudget'
import { shiftMonth, formatMonthLabel, getPeriodEnd, localDateString } from '@/features/budgets/lib/budgetPeriod'
import { budgetState } from '@/features/budgets/lib/budgetState'
import { Money } from '@/components/ui/Money'
import { BudgetSummaryCard } from '@/features/budgets/components/BudgetSummaryCard'
import { BudgetCategoryRow } from '@/features/budgets/components/BudgetCategoryRow'
import { computeCategoryBreakdown } from '@/features/analytics/lib/categoryBreakdown'
import { computeMonthlyTrend } from '@/features/analytics/lib/monthlyTrend'
import { computeTopCategories } from '@/features/analytics/lib/topCategories'
import { CategoryDonutChart, SEGMENT_COLORS } from '@/features/analytics/components/CategoryDonutChart'
import { MonthlyTrendChart } from '@/features/analytics/components/MonthlyTrendChart'
import { usePeriodStore } from '@/store/periodStore'
import { formatILS, agorotFromILS } from '@/lib/money/format'
import { categoryIconName } from '@/features/categories/lib/categoryIcon'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Screen } from '@/components/ui/Screen'
import { Card } from '@/components/ui/Card'
import { Divider } from '@/components/ui/Divider'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { SkeletonList } from '@/components/ui/SkeletonList'
import { EmptyState } from '@/components/ui/EmptyState'
import { DesktopPanelHeader } from '@/components/ui/DesktopPanelHeader'
import { DESKTOP_BREAKPOINT_PX, DESKTOP_PANEL_CLASS, DESKTOP_CARD_CLASS } from '@/constants/layout'
import { useUpdateTransaction } from '@/features/transactions/hooks/useUpdateTransaction'

const DESKTOP_PANEL = `web:desktop:min-h-[300px] ${DESKTOP_PANEL_CLASS}`
// Desktop Claude Design pass: 6 calendar months ending at the currently
// viewed month — matches the mockup's own "מגמה · 6 חודשים" trend card.
const TREND_MONTHS = 6

export default function Budgets() {
  const { t } = useTranslation()
  const router = useRouter()
  // The two design files draw the category list differently enough that a
  // utility override cannot express it — desktop pulls the ratio onto the
  // name line and drops the card chrome. Same route split the dashboard,
  // transactions and cash-flow screens already make.
  const { width } = useWindowDimensions()
  const isDesktopWeb = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT_PX
  const { user } = useAuth()
  const { colorScheme: scheme } = useColorScheme()
  const accentColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const { householdId, isLoading: isHouseholdLoading } = useHousehold(user?.id)
  const { categories, isLoading: isCategoriesLoading } = useCategories(householdId)
  const { recurringTransactions } = useRecurringTransactions(householdId)
  const periodStart = usePeriodStore((s) => s.selectedPeriodStart)
  const setPeriodStart = usePeriodStore((s) => s.setSelectedPeriodStart)
  const {
    categories: progress,
    totalAllocatedAgorot,
    totalSpentAgorot,
    isLoading: isProgressLoading,
    error,
    refetch: refetchProgress,
  } = useBudgetProgress(householdId, periodStart)
  // Folds in isHouseholdLoading (mobile-expo-reviewer finding — see
  // dashboard/index.tsx's identical comment for why this matters).
  const isLoading = isHouseholdLoading || isProgressLoading
  const saveAllocations = useSaveBudgetAllocations(householdId)
  const {
    uncategorized,
    isLoading: isUncategorizedLoading,
    error: uncategorizedError,
    refetch: refetchUncategorized,
  } = useUncategorizedTransactions(householdId)
  const updateTransaction = useUpdateTransaction(householdId)

  // Copy Previous Month Budget: a second, independent useBudgetProgress
  // read targeting last month's period. useBudgetProgress can't tell "no
  // budget row" apart from "budget row with zero allocations" (it always
  // resolves to categories: []) — deliberately not distinguished here
  // either, since both cases mean the same thing for this feature: nothing
  // to offer copying from, so the action stays hidden (empty-state A).
  const previousPeriodStart = shiftMonth(periodStart, -1)
  const { categories: previousProgress, isLoading: isPreviousProgressLoading } = useBudgetProgress(
    householdId,
    previousPeriodStart
  )

  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingAmount, setEditingAmount] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isPreparingSave, setIsPreparingSave] = useState(false)
  const [assigningTxnId, setAssigningTxnId] = useState<string | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState<string | null>(null)
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  const [isCopyingBudget, setIsCopyingBudget] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null)
  // UX-completeness audit finding: there was no way to drop a category out
  // of a budget once allocated, short of deleting the category entirely
  // from Settings (a much heavier, unrelated action). Confirmed via a
  // dedicated modal since this discards an amount without an undo.
  const [removingCategoryId, setRemovingCategoryId] = useState<string | null>(null)

  // The edit form is keyed off editingCategoryId matching a category from
  // THIS month's `progress` list. Navigating the month without clearing it
  // (e.g. via the prev/next buttons below) leaves a stale id that matches
  // nothing in the new month's list — the edit form silently vanishes, but
  // the "add category" Select stays hidden too (it's gated on
  // editingCategoryId === null), leaving the user unable to add or edit any
  // allocation until they save or happen to tap a same-id category. Clearing
  // both whenever the displayed month changes closes that gap.
  function handleMonthChange(nextPeriodStart: string) {
    setPeriodStart(nextPeriodStart)
    setEditingCategoryId(null)
    setEditingAmount('')
    setIsCopyModalOpen(false)
    setCopyError(null)
    setCopySuccessMessage(null)
    setRemovingCategoryId(null)
  }

  // save_budget_allocations() uses true-replace semantics (D3): the payload
  // IS the full desired set for the month, and anything omitted from it
  // gets deleted server-side. Building that payload from `progress` (a
  // cache that can be stale — this app has no Realtime channel on
  // budget_allocations, only on transactions) risks silently deleting a
  // partner's concurrent allocation on a different device
  // (qa-adversarial-reviewer finding: household A adds Food while B's
  // stale screen still only shows Rent, B then saves Transport, and B's
  // save wipes A's Food because it wasn't in B's payload). Refetching
  // immediately before building the payload substantially narrows this
  // window — it does not close it entirely (a true simultaneous save from
  // both devices within the same round trip is still possible, and is not
  // solved without either optimistic-concurrency versioning or a Realtime
  // channel on budget_allocations, neither of which is in this milestone's
  // approved scope) — accepted and documented the same way D5 accepts the
  // concurrent-partner notification race, not silently.
  async function handleSaveAllocation(categoryId: string) {
    const parsed = agorotFromILS(editingAmount)
    if (!parsed.ok || parsed.agorot === null) {
      setSaveError(t(`transactions.form.errors.amount.${parsed.error ?? 'invalid'}`))
      return
    }

    setIsPreparingSave(true)
    const { data: freshData } = await refetchProgress()
    setIsPreparingSave(false)
    const freshCategories = freshData?.categories ?? progress

    const nextAllocations = freshCategories
      .filter((c) => c.categoryId !== categoryId)
      .map((c) => ({ categoryId: c.categoryId, amountAgorot: c.allocatedAgorot }))
    nextAllocations.push({ categoryId, amountAgorot: parsed.agorot })

    saveAllocations.mutate(
      { periodStart, allocations: nextAllocations },
      {
        onSuccess: () => {
          setEditingCategoryId(null)
          setEditingAmount('')
          setSaveError(null)
        },
        onError: () => setSaveError(t('budgets.errors.generic')),
      }
    )
  }

  // Reuses save_budget_allocations()'s true-replace semantics (see the
  // comment above handleSaveAllocation): omitting categoryId from the
  // payload deletes that allocation row. No new engine or RPC logic —
  // this is the existing create/update path with one category left out.
  // Same fresh-refetch-before-payload guard for the same concurrent-
  // partner-edit reason.
  async function handleRemoveAllocation(categoryId: string) {
    setIsPreparingSave(true)
    const { data: freshData } = await refetchProgress()
    setIsPreparingSave(false)
    const freshCategories = freshData?.categories ?? progress

    const nextAllocations = freshCategories
      .filter((c) => c.categoryId !== categoryId)
      .map((c) => ({ categoryId: c.categoryId, amountAgorot: c.allocatedAgorot }))

    saveAllocations.mutate(
      { periodStart, allocations: nextAllocations },
      {
        onSuccess: () => {
          setEditingCategoryId(null)
          setEditingAmount('')
          setSaveError(null)
          setRemovingCategoryId(null)
        },
        onError: () => {
          setRemovingCategoryId(null)
          setSaveError(t('budgets.errors.generic'))
        },
      }
    )
  }

  // The plan shown in the review modal is built from ordinary (possibly
  // slightly stale) cached data — it's an informational preview, not the
  // write itself. handleConfirmCopyBudget recomputes this same plan
  // against freshly-refetched target-month data immediately before
  // writing, for the same concurrent-partner-edit reason documented on
  // handleSaveAllocation above: a stale "missing categories" list could
  // otherwise silently overwrite an allocation a partner just added.
  const validCategoryIds = new Set(categories.map((c) => c.id))
  const previousAllocationsForCopy = previousProgress.map((c) => ({
    categoryId: c.categoryId,
    amountAgorot: c.allocatedAgorot,
  }))
  const targetAllocationsForCopy = progress.map((c) => ({ categoryId: c.categoryId, amountAgorot: c.allocatedAgorot }))
  const copyPlan = planCopyPreviousMonthBudget(previousAllocationsForCopy, targetAllocationsForCopy, validCategoryIds)
  // categories must be loaded before validCategoryIds means anything —
  // useCategories() resolves to [] both while its query is still pending
  // AND when the household genuinely has zero active categories
  // (features/categories/hooks/useCategories.ts), indistinguishable from
  // inside this component. Without isCategoriesLoading here, a
  // still-loading categories query would make every previous-month
  // category look "no longer valid" and get silently reported as skipped
  // instead of offered for copy (qa-adversarial-reviewer finding). Mirrors
  // isHouseholdLoading's identical fold into `isLoading` above.
  const canOfferCopyPreviousMonth =
    !isPreviousProgressLoading && !isCategoriesLoading && previousAllocationsForCopy.length > 0

  async function handleConfirmCopyBudget() {
    if (isCopyingBudget) return
    setIsCopyingBudget(true)
    setCopyError(null)

    const { data: freshData } = await refetchProgress()
    const freshTargetAllocations = (freshData?.categories ?? progress).map((c) => ({
      categoryId: c.categoryId,
      amountAgorot: c.allocatedAgorot,
    }))
    const freshValidCategoryIds = new Set(categories.map((c) => c.id))
    const freshPlan = planCopyPreviousMonthBudget(previousAllocationsForCopy, freshTargetAllocations, freshValidCategoryIds)

    if (freshPlan.toCopy.length === 0) {
      setIsCopyingBudget(false)
      setIsCopyModalOpen(false)
      setCopySuccessMessage(t('budgets.copyPrevious.nothingToCopy'))
      return
    }

    const nextAllocations = [...freshTargetAllocations, ...freshPlan.toCopy]

    saveAllocations.mutate(
      { periodStart, allocations: nextAllocations },
      {
        onSuccess: () => {
          setIsCopyingBudget(false)
          setIsCopyModalOpen(false)
          setCopySuccessMessage(t('budgets.copyPrevious.successMessage'))
        },
        onError: () => {
          setIsCopyingBudget(false)
          setCopyError(t('budgets.errors.generic'))
        },
      }
    )
  }

  const addableCategories = categories.filter((c) => !progress.some((p) => p.categoryId === c.id))
  const periodEnd = getPeriodEnd(periodStart)
  const today = localDateString()
  // Mobile redesign: the month's state and each category's state now come
  // from one classifier (features/budgets/lib/budgetState.ts), which the
  // Home block uses too — the three surfaces used to derive it separately,
  // so a household could be told "בקצב" on Home and "מתקרב לגבול" here
  // about the same month. Its projection is still calculateBudgetPace's;
  // budgetState only classifies what that engine returns, and reports no
  // projection at all for a month too young (or too old) to extrapolate.
  const monthState = budgetState({
    allocatedAgorot: totalAllocatedAgorot,
    spentAgorot: totalSpentAgorot,
    periodStart,
    periodEnd,
    today,
  })

  // Desktop Claude Design pass: the "לאן הלך הכסף" donut + "מגמה" 6-month
  // trend the mockup places in the Budget screen's own right column — moved
  // here from the pre-redesign Dashboard, which showed this same analytics
  // window but the mockup's Home screen never does. One query, two derived
  // views (this-month breakdown, 6-month trend) — the same
  // filterForAnalytics boundary (excludes transfers, matches
  // useBudgetProgress's is_shared/is_excluded convention) both already
  // shared before this move.
  const trendPeriodStarts = Array.from({ length: TREND_MONTHS }, (_, i) => shiftMonth(periodStart, i - (TREND_MONTHS - 1)))
  const { transactions: analyticsTransactionsRaw, isLoading: isAnalyticsLoading } = useTransactions(householdId, {
    periodStart: trendPeriodStarts[0],
    periodEnd,
  })
  const analyticsTransactions = analyticsTransactionsRaw.map((t) => ({
    categoryId: t.category_id,
    amountAgorot: t.amount_agorot,
    txnDate: t.txn_date,
    isShared: t.is_shared,
    isExcluded: t.is_excluded,
    transferId: t.transfer_id,
  }))
  const categoryBreakdown = computeCategoryBreakdown(analyticsTransactions, periodStart)
  const totalBreakdownAgorot = categoryBreakdown.reduce((sum, entry) => sum + entry.spentAgorot, 0)
  const topBreakdownEntries = computeTopCategories(categoryBreakdown, 5)
  const otherBreakdownAgorot = totalBreakdownAgorot - topBreakdownEntries.reduce((sum, entry) => sum + entry.spentAgorot, 0)
  const monthlyTrend = computeMonthlyTrend(analyticsTransactions, trendPeriodStarts)
  const categoryNameById = Object.fromEntries(categories.map((c) => [c.id, c.name_he]))

  // Active recurring EXPENSE templates whose category has no allocation in
  // the month being viewed — including the ones with no category at all,
  // which by definition cannot be in any budget. Biggest first.
  const allocatedCategoryIds = new Set(progress.map((p) => p.categoryId))
  const outsideBudgetRecurring = recurringTransactions
    .filter((r) => r.is_active && r.amount_agorot < 0 && !(r.category_id && allocatedCategoryIds.has(r.category_id)))
    .sort((a, b) => a.amount_agorot - b.amount_agorot)

  return (
    <Screen width="wide">
      {/* Title and month on one 44px row, as the phone frame draws them.
          Desktop draws both in the shell header band instead, so the whole
          row is hidden there rather than duplicating the controls. */}
      <View className="mb-3 min-h-[44px] flex-row items-center justify-between gap-3 web:desktop:hidden">
        <Text className="text-title font-heebo text-ink-light dark:text-ink-dark">{t('budgets.title')}</Text>
        <MonthNavigator periodStart={periodStart} onChange={handleMonthChange} />
      </View>

      {error ? (
        <ErrorMessage message={t('budgets.errors.generic')} onRetry={refetchProgress} />
      ) : isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          <BudgetSummaryCard
            totalAllocatedAgorot={totalAllocatedAgorot}
            totalSpentAgorot={totalSpentAgorot}
            state={monthState}
            variant={isDesktopWeb ? 'row' : 'stacked'}
            testID="budget-summary"
          />

          {/* Desktop polish pass: each column below now renders as its own
              bordered panel (see below), which already reads as clearly
              grouped away from the hero — a plain spacer replaces the
              earlier standalone divider line, matching Dashboard's
              identical treatment. Desktop-only; mobile/tablet untouched. */}
          <View className="hidden web:desktop:mt-6 web:desktop:flex" />

          {/* Responsive/desktop pass: category budgets and the uncategorized
              queue sit side by side at desktop
              (`web:desktop:flex-row` — see _layout.tsx's
              DesktopSideRail comment for why `-reverse` is needed on web).
              Reversing keeps source/DOM order as [categories,
              uncategorized] while visually placing categories (primary) on
              the right and uncategorized (secondary) on the left — the
              correct RTL reading order. Visual QA + Desktop Polish pass:
              this had silently regressed to plain `flex-row` — the
              dedicated regression test only checked
              `.toContain('web:desktop:flex-row')`, satisfied by both forms,
              so the drift went uncaught. Restored to `-reverse` and the
              test tightened to exact-token matching. Mobile/tablet stay
              stacked in the original order (plain View column default). */}
          <View className="web:desktop:flex-row web:desktop:items-start web:desktop:gap-6">
          <View className="web:desktop:flex-1">
          {/* Desktop polish pass: the category-budgets column (list + the
              add-category control) becomes one bounded panel, so it reads
              as a single coherent area rather than a list with an isolated
              control below it — same pattern as Dashboard's panels, same
              existing tokens. Mobile/tablet untouched.
              Debugging pass: originally used `bg-surface-light/dark` here
              — the same token as the Screen's own root background — so the
              panel had zero fill contrast against the page and read as
              "not rendering." See dashboard/index.tsx's identical panel
              comment for the real-browser measurement that found this.
              `bg-surfaceMuted-light/dark` is the established, visually-
              distinct card tone used everywhere else.
              Both panels also share a desktop min-height floor: with
              `items-start` siblings that size to their own content, a short
              category list next to a longer uncategorized queue (or vice
              versa) otherwise left the shorter panel reading as an awkward
              sliver rather than a deliberate region. */}
          <View className={DESKTOP_PANEL}>
          {/* Per-category allocation editor + progress */}
          <DesktopPanelHeader
            icon="pie-chart-outline"
            title={t('budgets.categoriesTitle')}
            action={
              canOfferCopyPreviousMonth && (
                <Pressable
                  onPress={() => {
                    setCopySuccessMessage(null)
                    setCopyError(null)
                    setIsCopyModalOpen(true)
                  }}
                  accessibilityRole="button"
                >
                  <Text className="text-caption font-medium text-accent-light dark:text-accent-dark">
                    {t('budgets.copyPrevious.actionButton')}
                  </Text>
                </Pressable>
              )
            }
          />
          {copySuccessMessage && (
            <Text className="mb-2 text-caption text-positive-light dark:text-positive-dark">{copySuccessMessage}</Text>
          )}
          {progress.length === 0 ? (
            <>
              {/* Desktop polish pass: `compact` has no responsive variant —
                  a bigger, non-compact EmptyState at desktop keeps a
                  min-height panel from reading as an oversized empty box
                  around a tiny icon. Mobile keeps the original compact one. */}
              <View className="web:desktop:hidden">
                <EmptyState iconName="pie-chart-outline" message={t('budgets.noCategories')} hint={t('budgets.noCategoriesHint')} />
              </View>
              {/* Desktop Visual/Responsive Design pass: the zero-allocation
                  desktop state previously read as broken — a small icon +
                  one line inside a min-h-[300px] panel, with the ONLY way
                  to actually do something about it (the add-category
                  control) sitting in a completely separate box below this
                  panel. A second line explains what a monthly budget is
                  (not just "no categories"), extra vertical padding gives
                  the panel real weight instead of a thin sliver, and the
                  same add-category Select now renders inline here, inside
                  the same bounded card — the below-panel block further down
                  is hidden at desktop for this specific empty case so the
                  control isn't duplicated (mobile is untouched: it still
                  only ever renders the control in the one place it always
                  has). */}
              <View className="hidden web:desktop:flex web:desktop:items-center web:desktop:py-10">
                <View className="web:desktop:w-full web:desktop:max-w-[360px]">
                  <View className="mb-4">
                    <EmptyState
                      iconName="pie-chart-outline"
                      message={t('budgets.noCategories')}
                      hint={t('budgets.noCategoriesHint')}
                    />
                  </View>
                  {addableCategories.length > 0 && (
                    <Card>
                      <Select
                        variant="row"
                        label={t('budgets.addCategoryLabel')}
                        options={addableCategories.map((c) => ({
                          value: c.id,
                          label: c.name_he,
                          iconName: categoryIconName(c.icon),
                        }))}
                        value={null}
                        onChange={(value) => {
                          setEditingCategoryId(value)
                          setEditingAmount('')
                        }}
                        placeholder={t('budgets.addCategoryPlaceholder')}
                        sheetTitle={t('budgets.addCategoryLabel')}
                        leadingIcon={
                          <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                            <Ionicons name="add-circle-outline" size={ICON.row} color={accentColor} />
                          </View>
                        }
                      />
                    </Card>
                  )}
                </View>
              </View>
            </>
          ) : (
            <View className="gap-2.5">
              {progress.map((category) => {
                const categoryState = budgetState({
                  allocatedAgorot: category.allocatedAgorot,
                  spentAgorot: category.spentAgorot,
                  periodStart,
                  periodEnd,
                  today,
                })
                return (
                  <View key={category.categoryId}>
                    <BudgetCategoryRow
                      category={category}
                      state={categoryState}
                      variant={isDesktopWeb ? 'plain' : 'card'}
                      testID={`budget-category-${category.categoryId}`}
                      onPress={() => {
                        setEditingCategoryId(category.categoryId)
                        setEditingAmount(String(category.allocatedAgorot / 100))
                      }}
                      // The phone's chevron opens the category's own screen —
                      // "מהתקציב לתנועות של אותה קטגוריה". The row itself
                      // still opens the amount editor, which is the only
                      // place an allocation can be set: the save is a
                      // true-replace RPC over every allocation at once, so
                      // moving it to a single-category screen would mean a
                      // second copy of that flow. The desktop frame has no
                      // per-category screen and gets no chevron.
                      onOpenDetail={
                        isDesktopWeb ? undefined : () => router.push(`/budgets/${category.categoryId}`)
                      }
                    />
                    {editingCategoryId === category.categoryId && (
                      <View className="mt-2 rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark">
                        <Input
                          label={t('budgets.allocationLabel')}
                          value={editingAmount}
                          onChangeText={setEditingAmount}
                          keyboardType="decimal-pad"
                        />
                        {saveError && <ErrorMessage message={saveError} />}
                        <View className="flex-row gap-2 web:flex-row">
                          <View className="flex-1">
                            <Button
                              title={t('budgets.saveAllocation')}
                              loading={isPreparingSave || saveAllocations.isPending}
                              onPress={() => {
                                if (isPreparingSave || saveAllocations.isPending) return
                                void handleSaveAllocation(category.categoryId)
                              }}
                            />
                          </View>
                          <View className="flex-1">
                            <Button
                              title={t('common.cancel')}
                              variant="secondary"
                              disabled={isPreparingSave || saveAllocations.isPending}
                              onPress={() => {
                                setEditingCategoryId(null)
                                setEditingAmount('')
                                setSaveError(null)
                              }}
                            />
                          </View>
                        </View>
                        <Pressable
                          onPress={() => {
                            if (isPreparingSave || saveAllocations.isPending) return
                            setRemovingCategoryId(category.categoryId)
                          }}
                          disabled={isPreparingSave || saveAllocations.isPending}
                          accessibilityRole="button"
                          accessibilityLabel={t('budgets.removeAllocationLabel', { name: category.categoryNameHe })}
                          className="mt-3"
                        >
                          <Text className="text-caption font-medium text-danger-light dark:text-danger-dark">
                            {t('budgets.removeAllocation')}
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {/* "לא בתקציב · חיובים קבועים" — the design's chip strip under the
              category list. A household reading "8,700 ₪ מתוך" needs to know
              that the mortgage and the kindergarten are not in that number.

              "Not in this budget" needed no new rule: it is a recurring
              expense template whose category has no allocation in the period
              being viewed — a join over two things this screen already has.
              Ordered by amount so the largest lead, which is what the frame's
              own example shows.

              The frame heads this strip "חיובים קבועים גדולים". "Large" is
              dropped deliberately: no engine, column or ADR in this product
              defines a threshold above which a recurring charge is large, and
              inventing one here would put a number in a household's face that
              nothing else in the app agrees with. Every uncovered recurring
              charge is listed instead, biggest first. */}
          {outsideBudgetRecurring.length > 0 && (
            <View className="mt-5">
              <Text className="mb-1 text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                {t('budgets.outsideBudgetTitle')}
              </Text>
              <Text className="mb-2.5 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('budgets.outsideBudgetNote')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {outsideBudgetRecurring.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center gap-2 rounded-row border border-border-light bg-surface-light px-3 py-2.5 dark:border-border-dark dark:bg-surface-dark"
                  >
                    <Text className="text-caption font-sans text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {item.description}
                    </Text>
                    <Money agorot={Math.abs(item.amount_agorot)} size="caption" />
                  </View>
                ))}
              </View>
            </View>
          )}

          {editingCategoryId === null && addableCategories.length > 0 && (
            // Desktop polish pass: tightened from mt-3 to feel like part of
            // the same category-budgets area above it, rather than an
            // isolated control — mobile/tablet keep the original mt-3 gap.
            // Desktop Visual/Responsive Design pass: hidden at desktop
            // specifically when progress is empty — the block above already
            // renders this same control inline inside the empty-state card
            // in that case, and showing it twice would be a duplicate
            // control, not a fix. Mobile always renders it here regardless
            // (unchanged), and it still renders here at desktop too once
            // progress.length > 0 (the empty-state card above no longer
            // exists in that case).
            <View className={`mt-3 web:desktop:mt-2 ${progress.length === 0 ? 'web:desktop:hidden' : ''}`}>
              <Card>
                <Select
                  variant="row"
                  label={t('budgets.addCategoryLabel')}
                  options={addableCategories.map((c) => ({
                    value: c.id,
                    label: c.name_he,
                    iconName: categoryIconName(c.icon),
                  }))}
                  value={null}
                  onChange={(value) => {
                    setEditingCategoryId(value)
                    setEditingAmount('')
                  }}
                  placeholder={t('budgets.addCategoryPlaceholder')}
                  sheetTitle={t('budgets.addCategoryLabel')}
                  leadingIcon={
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
                      <Ionicons name="add-circle-outline" size={ICON.row} color={accentColor} />
                    </View>
                  }
                />
              </Card>
            </View>
          )}
          </View>
          </View>

          {/* Desktop Claude Design pass: a 300px sidebar (donut + 6-month
              trend + a compact uncategorized queue), matching the mockup's
              own right column — replacing the equal-width uncategorized
              panel this used to be. The donut/trend analytics moved here
              from the pre-redesign Dashboard, which showed this exact
              window but the approved Home mockup never does (see the
              trendPeriodStarts comment above). Desktop-only; mobile is
              entirely unaffected (this whole block is `web:desktop:`-only,
              and the uncategorized queue's own mobile rendering is
              untouched below). */}
          <View className="web:desktop:w-[300px] web:desktop:flex-none web:desktop:gap-3.5">
            {analyticsTransactionsRaw.length > 0 && !isAnalyticsLoading && totalBreakdownAgorot > 0 && (
              <View className={DESKTOP_CARD_CLASS}>
                <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('budgets.analytics.breakdownTitle')}
                </Text>
                <View className="mt-4 items-center">
                  <CategoryDonutChart breakdown={topBreakdownEntries} categoryNameById={categoryNameById} size={132} />
                </View>
                {/* The colour key. Every class here was `web:desktop:`-only,
                    including the swatch's own width and height — so on a
                    phone the legend rendered as bare names and percentages
                    with no swatch at all, which leaves the donut beside it
                    unreadable. A chart's legend is not a desktop
                    enhancement. */}
                <View className="mt-4 gap-2">
                  {topBreakdownEntries.map((entry, index) => (
                    <View key={entry.categoryId} className="flex-row items-center gap-2">
                      <View className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }} />
                      <Text className="flex-1 text-caption text-ink-light dark:text-ink-dark" numberOfLines={1}>
                        {categoryNameById[entry.categoryId] ?? ''}
                      </Text>
                      <Text
                        className="text-caption text-inkMuted-light dark:text-inkMuted-dark"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {Math.round((entry.spentAgorot / totalBreakdownAgorot) * 100)}%
                      </Text>
                    </View>
                  ))}
                  {otherBreakdownAgorot > 0 && (
                    <View className="flex-row items-center gap-2">
                      <View className="h-2.5 w-2.5 rounded-[3px] bg-border-light dark:bg-border-dark" />
                      <Text className="flex-1 text-caption text-ink-light dark:text-ink-dark">
                        {t('budgets.analytics.otherCategories')}
                      </Text>
                      <Text
                        className="text-caption text-inkMuted-light dark:text-inkMuted-dark"
                        style={{ fontVariant: ['tabular-nums'] }}
                      >
                        {Math.round((otherBreakdownAgorot / totalBreakdownAgorot) * 100)}%
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {!isAnalyticsLoading && monthlyTrend.some((point) => point.incomeAgorot > 0 || point.expenseAgorot > 0) && (
              <View className={DESKTOP_CARD_CLASS}>
                <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
                  {t('budgets.analytics.trendTitle')}
                </Text>
                <View className="web:desktop:mt-4">
                  <MonthlyTrendChart points={monthlyTrend} />
                </View>
              </View>
            )}

          <View className={DESKTOP_CARD_CLASS}>
          {/* Uncategorized transactions queue — the same real feature the
              pre-redesign equal-width column offered, condensed into a
              sidebar card matching the mockup's own compact treatment. */}
          <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
            {t('budgets.uncategorizedTitle')}
          </Text>
          {uncategorizedError ? (
            <ErrorMessage message={t('budgets.errors.generic')} onRetry={refetchUncategorized} />
          ) : isUncategorizedLoading ? (
            <SkeletonList rows={3} />
          ) : uncategorized.length === 0 ? (
            <>
              <View className="web:desktop:hidden">
                <EmptyState iconName="checkmark-done-outline" message={t('budgets.uncategorizedEmpty')} compact />
              </View>
              <View className="hidden web:desktop:flex">
                <EmptyState iconName="checkmark-done-outline" message={t('budgets.uncategorizedEmpty')} />
              </View>
            </>
          ) : (
            <Card>
              {uncategorized.map((txn, index) => (
                <View key={txn.id}>
                  {index > 0 && (
                    <View className="my-3">
                      <Divider />
                    </View>
                  )}
                  <View className="flex-row items-center justify-between web:flex-row">
                    <Text className="flex-1 text-body text-ink-light dark:text-ink-dark" numberOfLines={1}>
                      {txn.description}
                    </Text>
                    <Text className="text-body text-inkMuted-light dark:text-inkMuted-dark">
                      {formatILS(txn.amount_agorot)}
                    </Text>
                  </View>
                  {assigningTxnId === txn.id ? (
                    <View className="mt-2">
                      <Select
                        variant="row"
                        label={t('budgets.assignCategoryLabel')}
                        options={categories.map((c) => ({
                          value: c.id,
                          label: c.name_he,
                          iconName: categoryIconName(c.icon),
                        }))}
                        value={assignCategoryId}
                        onChange={setAssignCategoryId}
                        placeholder={t('budgets.assignCategoryLabel')}
                        sheetTitle={t('budgets.assignCategoryLabel')}
                        leadingIcon={
                          <CategoryIcon
                            icon={categories.find((c) => c.id === assignCategoryId)?.icon}
                            size="sm"
                          />
                        }
                      />
                      <View className="mt-2 flex-row gap-2 web:flex-row">
                        <View className="flex-1">
                          <Button
                            title={t('budgets.assignCategorySubmit')}
                            loading={updateTransaction.isPending}
                            onPress={() => {
                              if (!assignCategoryId || !householdId) return
                              updateTransaction.mutate(
                                { id: txn.id, householdId, categoryId: assignCategoryId },
                                {
                                  onSuccess: () => {
                                    setAssigningTxnId(null)
                                    setAssignCategoryId(null)
                                  },
                                }
                              )
                            }}
                          />
                        </View>
                        <View className="flex-1">
                          <Button
                            title={t('common.cancel')}
                            variant="secondary"
                            disabled={updateTransaction.isPending}
                            onPress={() => {
                              setAssigningTxnId(null)
                              setAssignCategoryId(null)
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Pressable onPress={() => setAssigningTxnId(txn.id)} accessibilityRole="button">
                      <Text className="mt-2 text-caption font-medium text-accent-light dark:text-accent-dark">
                        {t('budgets.assignCategoryButton')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </Card>
          )}
          </View>
          </View>
          </View>
        </>
      )}

      <CopyPreviousMonthBudgetModal
        visible={isCopyModalOpen}
        fromMonthLabel={formatMonthLabel(previousPeriodStart)}
        toMonthLabel={formatMonthLabel(periodStart)}
        plan={copyPlan}
        categories={categories}
        loading={isCopyingBudget}
        onConfirm={() => void handleConfirmCopyBudget()}
        onCancel={() => {
          if (isCopyingBudget) return
          setIsCopyModalOpen(false)
        }}
      />
      {copyError && <ErrorMessage message={copyError} />}

      <Modal
        visible={removingCategoryId !== null}
        title={t('budgets.removeConfirmTitle')}
        message={t('budgets.removeConfirmMessage', {
          name: progress.find((c) => c.categoryId === removingCategoryId)?.categoryNameHe ?? '',
        })}
        confirmLabel={t('budgets.removeAllocation')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={isPreparingSave || saveAllocations.isPending}
        onCancel={() => setRemovingCategoryId(null)}
        onConfirm={() => {
          if (removingCategoryId) void handleRemoveAllocation(removingCategoryId)
        }}
      />
    </Screen>
  )
}
