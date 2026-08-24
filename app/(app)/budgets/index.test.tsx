// Regression tests for two confirmed gaps found during the functional
// completeness audit:
//   1. Stuck edit state across month navigation: opening the inline
//      allocation editor for a category and then navigating to a different
//      month left `editingCategoryId` stale (never reset). Since the "add
//      category" Select is gated on `editingCategoryId === null`, the user
//      got stuck unable to add/edit any allocation for the new month.
//   2. Uncategorized-transactions fetch errors were silently hidden: the
//      hook's data falls back to [] on error, which rendered the exact same
//      "all categorized" success EmptyState as a genuinely empty queue.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import Budgets from './index'
import { usePeriodStore } from '@/store/periodStore'
import { formatMonthLabel, getCurrentMonthPeriodStart, shiftMonth } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'
import type { BudgetCategoryProgress } from '@/types/app'

interface MockBudgetProgressResult {
  categories: BudgetCategoryProgress[]
  totalAllocatedAgorot: number
  totalSpentAgorot: number
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<{ data?: { categories: BudgetCategoryProgress[] } }>
}

// Climbs from a section's title up to its panel wrapper by matching the
// panel's own marker class, rather than a fixed number of `.parent` hops —
// resilient to the DesktopPanelHeader's icon-chip + title nesting.
function climbToPanel(textNode: any) {
  let current = textNode
  while (current && !((current.props?.className as string | undefined) ?? '').includes('web:desktop:min-h-[300px]')) {
    current = current.parent
  }
  return current
}

// Desktop Claude Design pass: the sidebar's own cards (donut/trend/
// uncategorized) use DESKTOP_CARD_CLASS (marker 'web:desktop:rounded-hero'),
// not DESKTOP_PANEL_CLASS's 'web:desktop:min-h-[300px]' climbToPanel above
// looks for — same climbing technique, different marker class.
function climbToSidebarCard(textNode: any) {
  let current = textNode
  while (current && !((current.props?.className as string | undefined) ?? '').includes('web:desktop:rounded-hero')) {
    current = current.parent
  }
  return current
}

// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as other screen tests in this repo
// (components/ui/Select.tsx renders an Ionicons chevron).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
// Mutable per-test (like mockUncategorized below) so the "categories query
// still loading" race (qa-adversarial-reviewer finding) can be exercised
// from the same mocked module: useCategories() resolves to `categories: []`
// both while genuinely still loading AND once a household with zero active
// categories has loaded, indistinguishable from the categories array alone
// — isCategoriesLoading is what the screen must key off instead.
let mockCategoriesLoading = false
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: mockCategoriesLoading
      ? []
      : [
          { id: 'cat-1', name_he: 'מזון', icon: '🍔' },
          { id: 'cat-2', name_he: 'תחבורה', icon: '🚌' },
        ],
    isLoading: mockCategoriesLoading,
  }),
}))

const PROGRESS = [
  {
    categoryId: 'cat-1',
    categoryNameHe: 'מזון',
    categoryIcon: '🍔',
    allocatedAgorot: 100000,
    spentAgorot: 20000,
    remainingAgorot: 80000,
    percentSpent: 20,
  },
]
const DEFAULT_PROGRESS_RESULT: MockBudgetProgressResult = {
  categories: PROGRESS,
  totalAllocatedAgorot: 100000,
  totalSpentAgorot: 20000,
  isLoading: false,
  error: null,
  refetch: jest.fn<() => Promise<{ data?: { categories: BudgetCategoryProgress[] } }>>().mockResolvedValue({
    data: { categories: PROGRESS },
  }),
}

// Copy Previous Month Budget: the screen calls useBudgetProgress twice —
// once for the displayed (target) month, once for the previous month. The
// mock now branches on the periodStart argument instead of ignoring args,
// so each call site can be controlled independently per test.
const TARGET_PERIOD_START = getCurrentMonthPeriodStart()
const PREVIOUS_PERIOD_START = shiftMonth(TARGET_PERIOD_START, -1)
const PREVIOUS_PROGRESS = [
  {
    categoryId: 'cat-2',
    categoryNameHe: 'תחבורה',
    categoryIcon: '🚌',
    allocatedAgorot: 50000,
    spentAgorot: 0,
    remainingAgorot: 50000,
    percentSpent: 0,
  },
]
const DEFAULT_PREVIOUS_PROGRESS_RESULT: MockBudgetProgressResult = {
  categories: PREVIOUS_PROGRESS,
  totalAllocatedAgorot: 50000,
  totalSpentAgorot: 0,
  isLoading: false,
  error: null,
  refetch: jest.fn<() => Promise<{ data?: { categories: BudgetCategoryProgress[] } }>>().mockResolvedValue({
    data: { categories: PREVIOUS_PROGRESS },
  }),
}
const EMPTY_PROGRESS_RESULT: MockBudgetProgressResult = {
  categories: [],
  totalAllocatedAgorot: 0,
  totalSpentAgorot: 0,
  isLoading: false,
  error: null,
  refetch: jest.fn<() => Promise<{ data?: { categories: BudgetCategoryProgress[] } }>>().mockResolvedValue({
    data: { categories: [] },
  }),
}

const mockUseBudgetProgress = jest.fn<(householdId: string, periodStart: string) => MockBudgetProgressResult>()
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: (householdId: string, periodStart: string) => mockUseBudgetProgress(householdId, periodStart),
}))

// A fuller mutate mock than a plain jest.fn(): the copy-budget confirm flow
// relies on the onSuccess/onError callbacks passed to mutate() actually
// firing, the same way the real useMutation would. Defaults to succeeding
// synchronously; individual tests override with mockImplementationOnce for
// the failure/pending-write cases.
const mockSaveAllocationsMutate = jest.fn(
  (_variables: unknown, callbacks?: { onSuccess?: () => void; onError?: () => void }) => {
    callbacks?.onSuccess?.()
  }
)
jest.mock('@/features/budgets/hooks/useSaveBudgetAllocations', () => ({
  useSaveBudgetAllocations: () => ({ mutate: mockSaveAllocationsMutate, isPending: false }),
}))
jest.mock('@/features/transactions/hooks/useUpdateTransaction', () => ({
  useUpdateTransaction: () => ({ mutate: jest.fn(), isPending: false }),
}))
// Desktop Claude Design pass: the sidebar's donut/trend cards read from the
// same useTransactions hook Transactions/CashFlow already mock elsewhere —
// empty by default so every existing test below (none of which cares about
// the analytics sidebar) renders it as a no-op (both cards gate on having
// real spend, per DesktopCardClass' own conditionals).
let mockAnalyticsTransactions: { category_id: string | null; amount_agorot: number; txn_date: string; is_shared: boolean; is_excluded: boolean; transfer_id: string | null }[] = []
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: mockAnalyticsTransactions, isLoading: false, error: null }),
}))

// Fix 2's hook mock is mutable per-test so both the "genuine empty queue"
// and "fetch failed" cases can be exercised from the same mocked module.
let mockUncategorized: { id: string; description: string; amount_agorot: number; txn_date: string }[] = []
let mockUncategorizedError: Error | null = null
// The screen lists recurring charges that no allocation covers.
jest.mock('@/features/recurring/hooks/useRecurringTransactions', () => ({
  useRecurringTransactions: () => ({ recurringTransactions: [], isLoading: false, error: null }),
}))

jest.mock('@/features/budgets/hooks/useUncategorizedTransactions', () => ({
  useUncategorizedTransactions: () => ({
    uncategorized: mockUncategorized,
    isLoading: false,
    error: mockUncategorizedError,
  }),
}))

describe('Budgets', () => {
  beforeEach(() => {
    usePeriodStore.setState({ selectedPeriodStart: TARGET_PERIOD_START })
    mockUncategorized = []
    mockUncategorizedError = null
    mockCategoriesLoading = false
    mockAnalyticsTransactions = []
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? DEFAULT_PREVIOUS_PROGRESS_RESULT : DEFAULT_PROGRESS_RESULT
    )
    mockSaveAllocationsMutate.mockClear()
  })

  it('re-shows the add-category control after navigating months while a category edit was open (was stuck hidden)', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<Budgets />)

    // Initially the "add category" Select is visible.
    expect(getByText('בחירת קטגוריה')).toBeTruthy()

    // Open the inline editor for a category.
    await fireEvent.press(getByText(/מזון/))
    expect(getByText('סכום תקציב')).toBeTruthy()
    // While editing, the add-category Select is hidden by design.
    expect(queryByText('בחירת קטגוריה')).toBeNull()

    // Navigate to the next month WITHOUT saving — MonthNavigator's buttons
    // are icon-only (Design Phase 3), so they're targeted by their
    // accessibility label instead of by visible text.
    await fireEvent.press(getByLabelText('חודש הבא'))

    // The stale edit state must be cleared: add-category Select is back,
    // and the inline amount editor for the old category is gone.
    expect(getByText('בחירת קטגוריה')).toBeTruthy()
    expect(queryByText('סכום תקציב')).toBeNull()
  })

  it('also clears stuck edit state when navigating to the previous month', async () => {
    const { getByText, getByLabelText, queryByText } = await render(<Budgets />)

    await fireEvent.press(getByText(/מזון/))
    expect(queryByText('בחירת קטגוריה')).toBeNull()

    await fireEvent.press(getByLabelText('חודש קודם'))

    expect(getByText('בחירת קטגוריה')).toBeTruthy()
    expect(queryByText('סכום תקציב')).toBeNull()
  })

  // UX-completeness audit P2 fix: there was no way to drop a category out
  // of a budget once allocated (only overwrite its amount), and no way to
  // back out of the inline editor without saving or navigating away.
  it('closes the allocation editor via Cancel without saving anything', async () => {
    const { getByText, queryByText } = await render(<Budgets />)

    await fireEvent.press(getByText(/מזון/))
    expect(getByText('סכום תקציב')).toBeTruthy()

    await fireEvent.press(getByText('ביטול'))

    expect(queryByText('סכום תקציב')).toBeNull()
    expect(mockSaveAllocationsMutate).not.toHaveBeenCalled()
  })

  it('removes a category allocation after confirming, via the true-replace save RPC with that category omitted', async () => {
    const { getByText, getAllByText } = await render(<Budgets />)

    await fireEvent.press(getByText(/מזון/))
    await fireEvent.press(getByText('הסרת קטגוריה מהתקציב'))
    expect(mockSaveAllocationsMutate).not.toHaveBeenCalled()

    const confirmButtons = getAllByText('הסרת קטגוריה מהתקציב')
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]!)

    expect(mockSaveAllocationsMutate).toHaveBeenCalledWith(
      { periodStart: TARGET_PERIOD_START, allocations: [] },
      expect.anything()
    )
  })

  it('lets the remove-allocation confirmation be cancelled without writing anything', async () => {
    const { getByText, getAllByText } = await render(<Budgets />)

    await fireEvent.press(getByText(/מזון/))
    await fireEvent.press(getByText('הסרת קטגוריה מהתקציב'))
    // The inline editor's own Cancel button is still mounted behind the
    // confirm modal (editingCategoryId is untouched by opening it) — the
    // modal's own Cancel is the last "ביטול" in the tree.
    const cancelButtons = getAllByText('ביטול')
    await fireEvent.press(cancelButtons[cancelButtons.length - 1]!)

    expect(mockSaveAllocationsMutate).not.toHaveBeenCalled()
  })

  it('closes the assign-category form via Cancel without submitting', async () => {
    mockUncategorized = [{ id: 'txn-1', description: 'קניות בסופר', amount_agorot: -5000, txn_date: '2026-08-10' }]
    const { getByText, queryByText } = await render(<Budgets />)

    await fireEvent.press(getByText('שיוך לקטגוריה'))
    expect(getByText('שיוך')).toBeTruthy()

    await fireEvent.press(getByText('ביטול'))

    expect(queryByText('שיוך')).toBeNull()
  })

  it('shows the genuine empty state when the uncategorized queue really is empty', async () => {
    mockUncategorized = []
    mockUncategorizedError = null
    const { getAllByText, queryByText } = await render(<Budgets />)

    // Desktop polish pass: `compact` has no responsive variant, so this
    // empty state now renders twice (a compact mobile copy and a full-size
    // desktop copy, toggled by CSS RNTL can't evaluate) — both legitimately
    // exist in the tree at once.
    expect(getAllByText('כל התנועות מסווגות').length).toBe(2)
    expect(queryByText('משהו השתבש. נסו שוב')).toBeNull()
  })

  it('shows an error message instead of the false-success empty state when the uncategorized fetch fails', async () => {
    mockUncategorized = []
    mockUncategorizedError = new Error('network down')
    const { getByText, queryByText } = await render(<Budgets />)

    expect(getByText('משהו השתבש. נסו שוב')).toBeTruthy()
    expect(queryByText('כל התנועות מסווגות')).toBeNull()
  })

  // Design Phase 3 coverage: the hero summary card, the localized month
  // label (MonthNavigator), and the category row's remaining/exceeded
  // state text weren't asserted on before this phase.
  // Mobile redesign: the summary's hero figure is now what is LEFT, not
  // what was allocated — a household opens this screen to decide against
  // the remainder, and the allocation appears as the denominator it is.
  it('shows the localized month label and leads with what is left', async () => {
    const { getByText, getAllByText } = await render(<Budgets />)

    expect(getByText(formatMonthLabel(getCurrentMonthPeriodStart()))).toBeTruthy()
    // Remaining is the hero. It also appears as the category's own
    // remaining line, since the fixture has one category carrying the
    // whole budget.
    expect(getAllByText(formatILS(80000)).length).toBeGreaterThan(0)
    expect(
      getByText(i18n.t('budgets.summary.spentOf', { spent: formatILS(20000), total: formatILS(100000) }))
    ).toBeTruthy()
  })

  describe('end-of-month spending pace', () => {
    // Pins "today" to the 15th of the real current month/year, whatever
    // that happens to be when this suite runs — TARGET_PERIOD_START above
    // is itself derived from the real current date, so this keeps "today"
    // inside that same period without hardcoding a date the test could
    // outlive.
    function pinMidMonth() {
      const [year, month] = TARGET_PERIOD_START.split('-').map(Number) as [number, number]
      jest.useFakeTimers({ advanceTimers: false }).setSystemTime(new Date(year, month - 1, 15))
    }

    afterEach(() => {
      jest.useRealTimers()
    })

    it('shows the projected end-of-month total once mid-month, computed from the same totals as the hero figures', async () => {
      pinMidMonth()
      const { getByText } = await render(<Budgets />)

      // The projection is now a sentence rather than a labelled figure —
      // "בקצב הזה תעמדו בתקציב" for a month on course, the overspend
      // wording below when it is not.
      expect(getByText(i18n.t('budgets.summary.projectionOk'))).toBeTruthy()
    })

    it('does not show a pace projection on day 1 of the month — not enough data to average yet', async () => {
      const [year, month] = TARGET_PERIOD_START.split('-').map(Number) as [number, number]
      jest.useFakeTimers({ advanceTimers: false }).setSystemTime(new Date(year, month - 1, 1))

      const { queryByText } = await render(<Budgets />)
      expect(queryByText(i18n.t('budgets.summary.projectionOk'))).toBeNull()
      expect(queryByText(i18n.t('budgets.summary.paceMarker'))).toBeNull()
    })

    it('does not show a pace projection when viewing a month with no budget allocated', async () => {
      mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
        periodStart === PREVIOUS_PERIOD_START ? DEFAULT_PREVIOUS_PROGRESS_RESULT : EMPTY_PROGRESS_RESULT
      )
      pinMidMonth()

      const { queryByText } = await render(<Budgets />)
      expect(queryByText(i18n.t('budgets.summary.projectionOk'))).toBeNull()
      expect(queryByText(i18n.t('budgets.summary.paceMarker'))).toBeNull()
    })

    it('flags a projected overspend distinctly from an on-track projection', async () => {
      mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
        periodStart === PREVIOUS_PERIOD_START
          ? DEFAULT_PREVIOUS_PROGRESS_RESULT
          : { ...DEFAULT_PROGRESS_RESULT, totalAllocatedAgorot: 30000, totalSpentAgorot: 25000 }
      )
      pinMidMonth()

      const { getByText, queryByText } = await render(<Budgets />)
      expect(getByText(/חריגה צפויה של/)).toBeTruthy()
      expect(queryByText(i18n.t('budgets.summary.projectionOk'))).toBeNull()
      // Amber, not red: the month is over pace but still inside its
      // allocation, and the state chip has to say which.
      expect(getByText(i18n.t('budgets.state.approaching'))).toBeTruthy()
    })
  })

  it("shows the category's remaining amount, and says it is on track", async () => {
    const { getByText, getAllByText } = await render(<Budgets />)

    expect(getByText(i18n.t('budgets.category.remaining', { amount: formatILS(80000) }))).toBeTruthy()
    // Status reaches the household as a word, never as a color alone —
    // twice here, since the month summary and its single category are both
    // on track in this fixture.
    expect(getAllByText(i18n.t('budgets.state.onTrack')).length).toBe(2)
  })

  it('shows an exceeded state for a category that has spent past its allocation', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? DEFAULT_PREVIOUS_PROGRESS_RESULT
        : {
            ...DEFAULT_PROGRESS_RESULT,
            categories: [{ ...PROGRESS[0]!, spentAgorot: 120000, remainingAgorot: -20000, percentSpent: 120 }],
          }
    )

    const { getByText } = await render(<Budgets />)

    expect(getByText(i18n.t('budgets.category.exceeded', { amount: formatILS(20000) }))).toBeTruthy()
    expect(getByText(i18n.t('budgets.state.over'))).toBeTruthy()
  })

  it('shows a compact empty state when no categories have a budget yet', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? DEFAULT_PREVIOUS_PROGRESS_RESULT
        : { ...DEFAULT_PROGRESS_RESULT, categories: [], totalAllocatedAgorot: 0, totalSpentAgorot: 0 }
    )

    const { getAllByText } = await render(<Budgets />)

    expect(getAllByText('עדיין לא הוקצו קטגוריות לתקציב החודש.').length).toBe(2)
  })

  // Desktop Visual/Responsive Design pass: the desktop zero-allocation
  // state previously read as broken — a bare icon+message inside a small
  // panel, with the only actionable control (add-category) in a completely
  // separate box below it. Now includes an explanatory hint and the
  // add-category control inline in the same card at desktop.
  it('gives the desktop empty state an explanatory hint and an inline add-category control', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? DEFAULT_PREVIOUS_PROGRESS_RESULT
        : { ...DEFAULT_PROGRESS_RESULT, categories: [], totalAllocatedAgorot: 0, totalSpentAgorot: 0 }
    )

    const { getAllByText } = await render(<Budgets />)

    // Both the mobile and the desktop copy carry the hint now — EmptyState
    // itself renders it, rather than the desktop branch adding a second
    // Text under a hint-less component. Both exist in the RNTL tree at once
    // because CSS visibility cannot be evaluated here.
    expect(
      getAllByText(
        'תקציב חודשי הוא סכום שמוקצה לכל קטגוריית הוצאה, כדי לעקוב כמה נותר להוציא בה. הוסיפו קטגוריה ראשונה כדי להתחיל.'
      ).length
    ).toBe(2)
    // Mobile-compact + desktop-full renders both exist in the RNTL tree
    // simultaneously (CSS visibility can't be evaluated here) — same
    // established pattern as the empty-state message assertion above, now
    // also true for the add-category control itself since it's rendered
    // both inline (desktop) and in its own block (mobile, and desktop once
    // progress is non-empty — see the component's own comment).
    expect(getAllByText('הוספת קטגוריה לתקציב').length).toBe(2)
  })

  // Desktop polish pass: category budgets and the uncategorized-transactions
  // queue sit in a shared desktop grid (index.tsx's own comment). RNTL can't
  // evaluate real CSS media queries, so this asserts the structural things
  // that matter — both columns share the same grid wrapper, and it declares
  // flex-row-reverse (not plain flex-row) so categories (source-order-first,
  // the primary column) reads on the right in this RTL app — not a fake
  // pixel/viewport assertion.
  // Visual QA + Desktop Polish pass: this previously matched via
  // `.toContain('web:desktop:flex-row')`, a substring satisfied by BOTH the
  // reversed and unreversed forms — so it silently kept passing through a
  // real regression where the grid reverted to plain `flex-row`. Rewritten
  // to exact whitespace-token membership.
  it('groups category budgets and the sidebar into the same flex-row desktop grid container', async () => {
    const { getByText } = await render(<Budgets />)

    const categoriesPanel = climbToPanel(getByText('תקציב לפי קטגוריה'))
    const gridWrapper = categoriesPanel?.parent?.parent
    const tokens = ((gridWrapper?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:flex-row')
    expect(tokens).not.toContain('web:desktop:flex-row-reverse')

    // Desktop Claude Design pass: the uncategorized queue moved from an
    // equal-width column into a 300px sidebar card (climbToSidebarCard,
    // marker 'web:desktop:rounded-hero' — DESKTOP_CARD_CLASS's own radius,
    // distinct from DESKTOP_PANEL_CLASS's 'web:desktop:min-h-[300px]' the
    // category column still uses) — still a child of the same grid row.
    const uncategorizedCard = climbToSidebarCard(getByText('תנועות ללא קטגוריה'))
    expect(uncategorizedCard?.parent?.parent).toBe(gridWrapper)
  })

  // Desktop polish pass: the uncategorized queue gets its own bordered
  // sidebar card (DESKTOP_CARD_CLASS), same as the category column's own
  // bounded panel beside it.
  it('gives both the category-budgets column and the uncategorized sidebar card their own bordered desktop treatment', async () => {
    const { getByText } = await render(<Budgets />)

    expect(climbToPanel(getByText('תקציב לפי קטגוריה'))?.props.className as string).toContain('web:desktop:border')
    expect(climbToSidebarCard(getByText('תנועות ללא קטגוריה'))?.props.className as string).toContain('web:desktop:border')
  })

  // Debugging pass (real-browser regression): see dashboard/index.test.tsx's
  // identical test — these panels originally filled with `bg-surface-
  // light/dark`, the same token as the Screen's own root background,
  // giving zero fill contrast and reading as "not visibly rendering" even
  // though the classes were genuinely applied. Guards the real root cause
  // (the specific color token), not just "a background class exists."
  it('fills each desktop panel with the visually-distinct surfaceMuted tone, not the same tone as the page background', async () => {
    const { getByText } = await render(<Budgets />)

    const className = climbToPanel(getByText('תקציב לפי קטגוריה'))?.props.className as string
    expect(className).toContain('web:desktop:bg-surfaceMuted-light')
    expect(className).toContain('dark:web:desktop:bg-surfaceMuted-dark')
    expect(className).not.toContain('web:desktop:bg-surface-light')
    expect(className).not.toContain('web:desktop:bg-surface-dark')
  })

  // Desktop polish pass (still applies to the primary column): the category
  // list keeps its own desktop floor height so it never collapses to a
  // sliver. The sidebar no longer needs the same floor — it's several
  // independently-sized cards (donut/trend/uncategorized) stacked in a
  // column, not a single region competing for height against the category
  // list the way the old equal-width uncategorized column did.
  it('gives the category-budgets column a minimum desktop height', async () => {
    const { getByText } = await render(<Budgets />)

    expect(climbToPanel(getByText('תקציב לפי קטגוריה'))?.props.className as string).toContain('web:desktop:min-h-[300px]')
  })

  // Desktop Claude Design pass: the mockup's own right column — donut +
  // 6-month trend + the (now-compact) uncategorized queue, in a fixed-width
  // sidebar instead of the pre-redesign equal-width column.
  it('shows the uncategorized queue in a 300px sidebar alongside the category-budgets column', async () => {
    const { getByText } = await render(<Budgets />)

    const sidebar = climbToSidebarCard(getByText('תנועות ללא קטגוריה'))?.parent
    const tokens = ((sidebar?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:w-[300px]')
  })
})

describe('Budgets — copy previous month budget', () => {
  beforeEach(() => {
    usePeriodStore.setState({ selectedPeriodStart: TARGET_PERIOD_START })
    mockUncategorized = []
    mockUncategorizedError = null
    mockCategoriesLoading = false
    mockAnalyticsTransactions = []
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? DEFAULT_PREVIOUS_PROGRESS_RESULT : DEFAULT_PROGRESS_RESULT
    )
    mockSaveAllocationsMutate.mockClear()
  })

  const actionButtonLabel = () => i18n.t('budgets.copyPrevious.actionButton')
  const confirmLabel = () => i18n.t('budgets.copyPrevious.confirm')

  it('shows the copy-previous-month action when the previous month has allocations', async () => {
    const { getByText } = await render(<Budgets />)
    expect(getByText(actionButtonLabel())).toBeTruthy()
  })

  it('hides the copy action when there is no previous-month budget', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? EMPTY_PROGRESS_RESULT : DEFAULT_PROGRESS_RESULT
    )
    const { queryByText } = await render(<Budgets />)
    expect(queryByText(actionButtonLabel())).toBeNull()
  })

  // useBudgetProgress resolves both "no budget row for last month" and "a
  // budget row exists but every allocation was removed" to the same
  // categories: [] shape (see index.tsx's comment on this) — a deliberate
  // simplification, since both cases mean the same thing here: nothing to
  // offer copying from.
  it('hides the copy action when the previous month exists but has zero allocations', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? EMPTY_PROGRESS_RESULT : DEFAULT_PROGRESS_RESULT
    )
    const { queryByText } = await render(<Budgets />)
    expect(queryByText(actionButtonLabel())).toBeNull()
  })

  // qa-adversarial-reviewer finding: useCategories() also resolves to
  // categories: [] while its own query is still in flight — indistinguishable
  // from a household with genuinely zero active categories. Without gating
  // on its isLoading, every previous-month category would look "no longer
  // valid" during that window and get silently reported as skipped instead
  // of offered for copy. The action must stay hidden (not show a false
  // skipped-category state) until categories has actually resolved.
  it('hides the copy action while categories are still loading, rather than falsely reporting every category as skipped', async () => {
    mockCategoriesLoading = true
    const { queryByText } = await render(<Budgets />)
    expect(queryByText(actionButtonLabel())).toBeNull()
  })

  it('lists every previous-month category to copy when the target month is empty', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? DEFAULT_PREVIOUS_PROGRESS_RESULT : EMPTY_PROGRESS_RESULT
    )
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))

    expect(getByText('תחבורה')).toBeTruthy()
    expect(getByText(formatILS(50000))).toBeTruthy()
  })

  it('preserves existing target-month allocations and only lists the missing categories to copy', async () => {
    // Previous month has both cat-1 (food) and cat-2 (transport). Target
    // month already has cat-1 — only cat-2 should show up as "to copy".
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? {
            ...DEFAULT_PREVIOUS_PROGRESS_RESULT,
            categories: [...PREVIOUS_PROGRESS, { ...PROGRESS[0]! }],
          }
        : DEFAULT_PROGRESS_RESULT
    )
    const { getByText, queryByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))

    expect(getByText('תחבורה')).toBeTruthy()
    expect(
      queryByText(i18n.t('budgets.copyPrevious.alreadyExisting', { count: 1, toMonth: formatMonthLabel(TARGET_PERIOD_START) }))
    ).toBeTruthy()
  })

  it('shows the exact required message when every previous-month category already exists in the target month', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? DEFAULT_PREVIOUS_PROGRESS_RESULT
        : { ...DEFAULT_PROGRESS_RESULT, categories: [...PROGRESS, { ...PREVIOUS_PROGRESS[0]! }] }
    )
    const { getByText, queryByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))

    expect(getByText('כל הקטגוריות מהחודש הקודם כבר קיימות בתקציב החודש')).toBeTruthy()
    // Nothing to confirm — the confirm button is not offered at all.
    expect(queryByText(confirmLabel())).toBeNull()
  })

  it('skips a previous-month category that no longer exists and reports it', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? {
            ...DEFAULT_PREVIOUS_PROGRESS_RESULT,
            categories: [...PREVIOUS_PROGRESS, { ...PREVIOUS_PROGRESS[0]!, categoryId: 'cat-deleted', categoryNameHe: 'ישן' }],
          }
        : EMPTY_PROGRESS_RESULT
    )
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))

    expect(getByText(i18n.t('budgets.copyPrevious.skippedDeleted', { count: 1 }))).toBeTruthy()
    expect(getByText('תחבורה')).toBeTruthy()
  })

  it('writes only the target month, preserving existing allocations and copying exact previous-month amounts', async () => {
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? DEFAULT_PREVIOUS_PROGRESS_RESULT : DEFAULT_PROGRESS_RESULT
    )
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))
    await fireEvent.press(getByText(confirmLabel()))

    expect(mockSaveAllocationsMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockSaveAllocationsMutate.mock.calls[0] as [{ periodStart: string; allocations: unknown[] }]
    expect(variables.periodStart).toBe(TARGET_PERIOD_START)
    expect(variables.allocations).toEqual(
      expect.arrayContaining([
        { categoryId: 'cat-1', amountAgorot: 100000 }, // existing target allocation, unchanged
        { categoryId: 'cat-2', amountAgorot: 50000 }, // copied from the previous month, exact agorot amount
      ])
    )
    expect(variables.allocations).toHaveLength(2)
    expect(getByText(i18n.t('budgets.copyPrevious.successMessage'))).toBeTruthy()
  })

  // qa-adversarial-reviewer finding: none of the other copy tests ever make
  // refetch() resolve with data that actually differs from the stale
  // `progress` closure, so they can't tell a real "refetch fresh data
  // before building the payload" implementation apart from one that just
  // reuses the stale cache and ignores the refetch result entirely. This
  // reproduces the exact scenario handleConfirmCopyBudget's own comment
  // describes: household member B's screen is showing a stale target-month
  // allocation set (only cat-1) while member A has already concurrently
  // added cat-3 to the same month server-side. The refetch that runs right
  // before the copy payload is built picks that up. If the payload were
  // ever built from the stale `progress` closure instead of the refetch
  // result, cat-3 would be silently dropped from the true-replace payload
  // sent to save_budget_allocations — deleting A's concurrent allocation.
  it('builds the copy payload from the freshly-refetched target month, not the stale cache, so a concurrent partner edit is preserved', async () => {
    const freshTargetWithConcurrentEdit: BudgetCategoryProgress[] = [
      ...PROGRESS,
      {
        categoryId: 'cat-3',
        categoryNameHe: 'concurrent',
        categoryIcon: '💡',
        allocatedAgorot: 77700,
        spentAgorot: 0,
        remainingAgorot: 77700,
        percentSpent: 0,
      },
    ]
    const refetchWithConcurrentEdit = jest
      .fn<() => Promise<{ data?: { categories: BudgetCategoryProgress[] } }>>()
      .mockResolvedValue({ data: { categories: freshTargetWithConcurrentEdit } })

    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? DEFAULT_PREVIOUS_PROGRESS_RESULT
        : // `categories` here is deliberately the STALE set (just cat-1, no
          // cat-3) — exactly like a screen that hasn't re-rendered since
          // member A's concurrent write. Only `refetch()` knows about cat-3.
          { ...DEFAULT_PROGRESS_RESULT, refetch: refetchWithConcurrentEdit }
    )
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))
    await fireEvent.press(getByText(confirmLabel()))

    expect(refetchWithConcurrentEdit).toHaveBeenCalledTimes(1)
    expect(mockSaveAllocationsMutate).toHaveBeenCalledTimes(1)
    const [variables] = mockSaveAllocationsMutate.mock.calls[0] as [{ periodStart: string; allocations: unknown[] }]
    expect(variables.allocations).toEqual(
      expect.arrayContaining([
        { categoryId: 'cat-1', amountAgorot: 100000 }, // existing target allocation, unchanged
        { categoryId: 'cat-3', amountAgorot: 77700 }, // member A's concurrent edit — must survive the true-replace payload
        { categoryId: 'cat-2', amountAgorot: 50000 }, // copied from the previous month
      ])
    )
    expect(variables.allocations).toHaveLength(3)
  })

  it('shows an error and keeps the state safe when the write fails', async () => {
    mockSaveAllocationsMutate.mockImplementationOnce((_variables: unknown, callbacks?: { onError?: () => void }) => {
      callbacks?.onError?.()
    })
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))
    await fireEvent.press(getByText(confirmLabel()))

    expect(getByText('משהו השתבש. נסו שוב')).toBeTruthy()
    // No false success — the modal stays open on failure.
    expect(getByText(confirmLabel())).toBeTruthy()
  })

  it('prevents a double-submit while the copy write is in flight', async () => {
    // A refetch that never resolves simulates a write still in progress —
    // the confirm Button flips to its loading/disabled state and stays
    // there, so a second tap on the same element must be a no-op.
    const pendingRefetch = jest.fn<() => Promise<{ data?: { categories: BudgetCategoryProgress[] } }>>(
      () => new Promise(() => {})
    )
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START
        ? DEFAULT_PREVIOUS_PROGRESS_RESULT
        : { ...DEFAULT_PROGRESS_RESULT, refetch: pendingRefetch }
    )
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))
    const confirmButton = getByText(confirmLabel())
    await fireEvent.press(confirmButton)
    await fireEvent.press(confirmButton)

    expect(pendingRefetch).toHaveBeenCalledTimes(1)
    expect(mockSaveAllocationsMutate).not.toHaveBeenCalled()
  })

  it('cancelling the review step writes nothing', async () => {
    const { getByText } = await render(<Budgets />)

    await fireEvent.press(getByText(actionButtonLabel()))
    await fireEvent.press(getByText(i18n.t('common.cancel')))

    expect(mockSaveAllocationsMutate).not.toHaveBeenCalled()
  })
})

// Desktop Claude Design pass: the sidebar's donut ("לאן הלך הכסף") and
// 6-month trend ("מגמה · 6 חודשים") cards, moved here from the pre-redesign
// Dashboard (its own rebuild dropped this analytics window since the
// approved Home mockup never showed it — see DesktopDashboard.tsx's header
// comment).
describe('Budgets — sidebar analytics', () => {
  beforeEach(() => {
    usePeriodStore.setState({ selectedPeriodStart: TARGET_PERIOD_START })
    mockUncategorized = []
    mockUncategorizedError = null
    mockCategoriesLoading = false
    mockUseBudgetProgress.mockImplementation((_householdId: string, periodStart: string) =>
      periodStart === PREVIOUS_PERIOD_START ? DEFAULT_PREVIOUS_PROGRESS_RESULT : DEFAULT_PROGRESS_RESULT
    )
  })

  it('shows neither the donut nor the trend card when the household has no spend in the 6-month window', async () => {
    mockAnalyticsTransactions = []

    const { queryByText } = await render(<Budgets />)

    expect(queryByText(i18n.t('budgets.analytics.breakdownTitle'))).toBeNull()
    expect(queryByText(i18n.t('budgets.analytics.trendTitle'))).toBeNull()
  })

  it('shows the donut card with a category legend once the month has real spend', async () => {
    mockAnalyticsTransactions = [
      {
        category_id: 'cat-1',
        amount_agorot: -30000,
        txn_date: `${TARGET_PERIOD_START}-05`,
        is_shared: true,
        is_excluded: false,
        transfer_id: null,
      },
      {
        category_id: 'cat-2',
        amount_agorot: -10000,
        txn_date: `${TARGET_PERIOD_START}-06`,
        is_shared: true,
        is_excluded: false,
        transfer_id: null,
      },
    ]

    const { getByText, getAllByText } = await render(<Budgets />)

    expect(getByText(i18n.t('budgets.analytics.breakdownTitle'))).toBeTruthy()
    // "מזון"/"תחבורה" also appear as the category-budgets column's own row
    // names — at least one match each is the donut legend's own row.
    expect(getAllByText('מזון').length).toBeGreaterThanOrEqual(1)
    expect(getByText('75%')).toBeTruthy()
    expect(getAllByText('תחבורה').length).toBeGreaterThanOrEqual(1)
    expect(getByText('25%')).toBeTruthy()
  })

  it('shows the trend card once any of the 6 months has real income or expense', async () => {
    mockAnalyticsTransactions = [
      {
        category_id: 'cat-1',
        amount_agorot: -30000,
        txn_date: `${TARGET_PERIOD_START}-05`,
        is_shared: true,
        is_excluded: false,
        transfer_id: null,
      },
    ]

    const { getByText, getByTestId } = await render(<Budgets />)

    expect(getByText(i18n.t('budgets.analytics.trendTitle'))).toBeTruthy()
    expect(getByTestId('monthly-trend-chart-svg', { includeHiddenElements: true })).toBeTruthy()
  })

  it("excludes a transfer leg's amount from both the donut and the trend", async () => {
    mockAnalyticsTransactions = [
      {
        category_id: null,
        amount_agorot: -50000,
        txn_date: `${TARGET_PERIOD_START}-05`,
        is_shared: true,
        is_excluded: false,
        transfer_id: 'transfer-1',
      },
    ]

    const { queryByText } = await render(<Budgets />)

    // A transfer leg is never categorized in this fixture and is excluded
    // from analytics entirely (filterForAnalytics) — neither card has
    // anything to show.
    expect(queryByText(i18n.t('budgets.analytics.breakdownTitle'))).toBeNull()
    expect(queryByText(i18n.t('budgets.analytics.trendTitle'))).toBeNull()
  })
})
