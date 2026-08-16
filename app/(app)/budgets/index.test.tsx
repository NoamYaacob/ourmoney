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
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
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
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({
    categories: [
      { id: 'cat-1', name_he: 'מזון', icon: '🍔' },
      { id: 'cat-2', name_he: 'תחבורה', icon: '🚌' },
    ],
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

// Fix 2's hook mock is mutable per-test so both the "genuine empty queue"
// and "fetch failed" cases can be exercised from the same mocked module.
let mockUncategorized: { id: string; description: string; amount_agorot: number; txn_date: string }[] = []
let mockUncategorizedError: Error | null = null
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
  it('shows the localized month label and the hero total/spent/remaining figures', async () => {
    const { getByText } = await render(<Budgets />)

    expect(getByText(formatMonthLabel(getCurrentMonthPeriodStart()))).toBeTruthy()
    expect(getByText(formatILS(100000))).toBeTruthy() // total budget (hero figure)
    expect(getByText(formatILS(20000))).toBeTruthy() // spent
    expect(getByText(formatILS(80000))).toBeTruthy() // remaining
  })

  it("shows the category's remaining amount in a healthy (non-exceeded) tone", async () => {
    const { getByText } = await render(<Budgets />)

    expect(getByText(`נותרו ${formatILS(80000)}`)).toBeTruthy()
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

    expect(getByText(`חריגה של ${formatILS(20000)}`)).toBeTruthy()
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

  // Desktop polish pass: category budgets and the uncategorized-transactions
  // queue sit in a shared desktop grid (index.tsx's own comment). RNTL can't
  // evaluate real CSS media queries, so this asserts the structural things
  // that matter — both columns share the same grid wrapper, and it declares
  // flex-row-reverse (not plain flex-row) so categories (source-order-first,
  // the primary column) reads on the right in this RTL app — not a fake
  // pixel/viewport assertion.
  it('groups category budgets and the uncategorized queue into the same flex-row-reverse desktop grid container', async () => {
    const { getByText } = await render(<Budgets />)

    const categoriesPanel = climbToPanel(getByText('תקציב לפי קטגוריה'))
    const gridWrapper = categoriesPanel?.parent?.parent
    expect(gridWrapper?.props.className as string).toContain('web:desktop:flex-row-reverse')

    const uncategorizedPanel = climbToPanel(getByText('תנועות ללא קטגוריה'))
    expect(uncategorizedPanel?.parent?.parent).toBe(gridWrapper)
  })

  // Desktop polish pass: with the category-budgets side often fuller than
  // the uncategorized-queue side, an unbounded "nearly empty" secondary
  // column read as lopsided — both columns now get the same bordered panel
  // treatment so the uncategorized side looks intentional even when empty.
  it('gives both the category-budgets and uncategorized columns their own bounded desktop panel', async () => {
    const { getByText } = await render(<Budgets />)

    expect(climbToPanel(getByText('תקציב לפי קטגוריה'))?.props.className as string).toContain('web:desktop:border')
    expect(climbToPanel(getByText('תנועות ללא קטגוריה'))?.props.className as string).toContain('web:desktop:border')
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

  // Desktop polish pass: with `items-start` siblings that size to their own
  // content, a short category list next to a longer uncategorized queue
  // (or vice versa) read as an awkward sliver instead of a deliberate
  // region — both panels now share a desktop floor height so neither ever
  // collapses to near-nothing next to a fuller sibling.
  it('gives both desktop panels a shared minimum height so neither collapses next to a fuller sibling', async () => {
    const { getByText } = await render(<Budgets />)

    expect(climbToPanel(getByText('תקציב לפי קטגוריה'))?.props.className as string).toContain('web:desktop:min-h-[300px]')
    expect(climbToPanel(getByText('תנועות ללא קטגוריה'))?.props.className as string).toContain('web:desktop:min-h-[300px]')
  })
})

describe('Budgets — copy previous month budget', () => {
  beforeEach(() => {
    usePeriodStore.setState({ selectedPeriodStart: TARGET_PERIOD_START })
    mockUncategorized = []
    mockUncategorizedError = null
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
