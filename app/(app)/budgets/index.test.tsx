// Regression tests for two confirmed gaps found during the functional
// completeness audit:
//   1. Stuck edit state across month navigation: opening the inline
//      allocation editor for a category and then navigating to a different
//      month left `editingCategoryId` stale (never reset). Since the "add
//      category" Select is gated on `editingCategoryId === null`, the user
//      got stuck unable to add/edit any allocation for the new month.
//   2. Uncategorized-transactions fetch errors were silently hidden: the
//      hook's data falls back to [] on error, which rendered the exact same
//      "🎉 all categorized" success EmptyState as a genuinely empty queue.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import '@/i18n'
import Budgets from './index'
import { usePeriodStore } from '@/store/periodStore'
import { getCurrentMonthPeriodStart } from '@/features/budgets/lib/budgetPeriod'

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
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: () => ({
    categories: PROGRESS,
    totalAllocatedAgorot: 100000,
    totalSpentAgorot: 20000,
    isLoading: false,
    error: null,
    refetch: jest.fn<() => Promise<{ data: { categories: typeof PROGRESS } }>>().mockResolvedValue({
      data: { categories: PROGRESS },
    }),
  }),
}))
jest.mock('@/features/budgets/hooks/useSaveBudgetAllocations', () => ({
  useSaveBudgetAllocations: () => ({ mutate: jest.fn(), isPending: false }),
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
    usePeriodStore.setState({ selectedPeriodStart: getCurrentMonthPeriodStart() })
    mockUncategorized = []
    mockUncategorizedError = null
  })

  it('re-shows the add-category control after navigating months while a category edit was open (was stuck hidden)', async () => {
    const { getByText, queryByText } = await render(<Budgets />)

    // Initially the "add category" Select is visible.
    expect(getByText('בחירת קטגוריה')).toBeTruthy()

    // Open the inline editor for a category.
    await fireEvent.press(getByText(/מזון/))
    expect(getByText('סכום תקציב')).toBeTruthy()
    // While editing, the add-category Select is hidden by design.
    expect(queryByText('בחירת קטגוריה')).toBeNull()

    // Navigate to the next month WITHOUT saving.
    await fireEvent.press(getByText('חודש הבא ▶'))

    // The stale edit state must be cleared: add-category Select is back,
    // and the inline amount editor for the old category is gone.
    expect(getByText('בחירת קטגוריה')).toBeTruthy()
    expect(queryByText('סכום תקציב')).toBeNull()
  })

  it('also clears stuck edit state when navigating to the previous month', async () => {
    const { getByText, queryByText } = await render(<Budgets />)

    await fireEvent.press(getByText(/מזון/))
    expect(queryByText('בחירת קטגוריה')).toBeNull()

    await fireEvent.press(getByText('◀ חודש קודם'))

    expect(getByText('בחירת קטגוריה')).toBeTruthy()
    expect(queryByText('סכום תקציב')).toBeNull()
  })

  it('shows the genuine empty state when the uncategorized queue really is empty', async () => {
    mockUncategorized = []
    mockUncategorizedError = null
    const { getByText, queryByText } = await render(<Budgets />)

    expect(getByText('כל התנועות מסווגות 🎉')).toBeTruthy()
    expect(queryByText('משהו השתבש. נסו שוב')).toBeNull()
  })

  it('shows an error message instead of the false-success empty state when the uncategorized fetch fails', async () => {
    mockUncategorized = []
    mockUncategorizedError = new Error('network down')
    const { getByText, queryByText } = await render(<Budgets />)

    expect(getByText('משהו השתבש. נסו שוב')).toBeTruthy()
    expect(queryByText('כל התנועות מסווגות 🎉')).toBeNull()
  })
})
