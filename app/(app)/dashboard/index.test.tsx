// Screen-level regression tests for two Dashboard-embedded Analytics gaps
// found by audit:
//   - the monthly trend chart section had no empty-state message, unlike
//     the category-donut and top-categories sections right next to it
//   - the analytics useTransactions() call's `error` was never checked, so
//     a failed query silently rendered the same empty state as a
//     genuinely-empty household (fetch failure indistinguishable from zero
//     transactions)
// useTransactions is called twice by the screen with different filters (a
// `periodStart`-only call for "recent transactions", and a
// `periodStart`+`periodEnd` call for the analytics window) — the mock
// below dispatches on the presence of `periodEnd` to control each
// independently, the same way import.test.tsx mocks
// pickAndReadCsvFile per-test.
import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import '@/i18n'
import Dashboard from './index'
import type { TransactionFilters } from '@/features/transactions/hooks/useTransactions'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: () => ({
    categories: [],
    totalAllocatedAgorot: 0,
    totalSpentAgorot: 0,
    isLoading: false,
    error: null,
  }),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [] }),
}))
const mockUseTransactions =
  jest.fn<(householdId: string | null | undefined, filters?: TransactionFilters) => {
    transactions: unknown[]
    isLoading: boolean
    error: Error | null
  }>()
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: (householdId: string | null | undefined, filters?: TransactionFilters) =>
    mockUseTransactions(householdId, filters),
}))
// Avoids a deep, environment-specific import chain
// (@expo/vector-icons -> expo-font -> expo-asset) unrelated to what this
// test verifies — same rationale as app/(app)/_layout.test.tsx's identical
// mock (FAB.tsx and components/ui/Select.tsx both render an Ionicons icon).
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))

const EMPTY_ANALYTICS_MESSAGE = 'אין מספיק נתונים להצגה.'
const GENERIC_ERROR_MESSAGE = 'משהו השתבש. נסו שוב'

function recentResult() {
  return { transactions: [], isLoading: false, error: null }
}

// The recent-transactions call never passes `periodEnd`; only the analytics
// window call does — that's the one distinguishing feature the mock below
// dispatches on.
function mockAnalytics(result: { transactions?: unknown[]; isLoading?: boolean; error?: Error | null }) {
  mockUseTransactions.mockImplementation((_householdId, filters) => {
    if (filters?.periodEnd) {
      return { transactions: result.transactions ?? [], isLoading: result.isLoading ?? false, error: result.error ?? null }
    }
    return recentResult()
  })
}

describe('Dashboard analytics section', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows the analytics empty state for the monthly trend chart when the 6-month window has zero transactions', async () => {
    mockAnalytics({ transactions: [] })

    const { getAllByText, queryByTestId } = await render(<Dashboard />)

    // The donut/top-categories sections right next to it are legitimately
    // empty too in this fixture (zero transactions), so the same shared
    // "אין מספיק נתונים להצגה." message is expected to appear for all
    // three analytics sections, not just the trend chart alone — the
    // trend-chart-specific assertion is the SVG's absence below.
    expect(getAllByText(EMPTY_ANALYTICS_MESSAGE).length).toBeGreaterThanOrEqual(1)
    // The chart's own hidden wrapper marks it accessibilityElementsHidden
    // (MonthlyTrendChart.test.tsx's convention), so it must be looked up
    // with includeHiddenElements to be found at all when it IS rendered.
    expect(queryByTestId('monthly-trend-chart-svg', { includeHiddenElements: true })).toBeNull()
  })

  it('renders the monthly trend chart (not the empty state) once the 6-month window has a real transaction', async () => {
    mockAnalytics({
      transactions: [
        {
          id: 'txn-1',
          category_id: 'cat-1',
          amount_agorot: -5000,
          txn_date: '2026-08-05',
          is_shared: true,
          is_excluded: false,
          description: 'קפה',
        },
      ],
    })

    const { getByTestId } = await render(<Dashboard />)

    expect(getByTestId('monthly-trend-chart-svg', { includeHiddenElements: true })).toBeTruthy()
  })

  it('shows an error message for every analytics section when the analytics query fails, instead of a false empty state', async () => {
    mockAnalytics({ error: new Error('network down') })

    const { getAllByText, queryByText, queryByTestId } = await render(<Dashboard />)

    // All three analytics sections (trend, breakdown, top categories) share
    // this one query — a failure must surface on all three, matching how
    // progressError/transactionsError are already checked independently in
    // the budget-summary and recent-transactions sections above.
    expect(getAllByText(GENERIC_ERROR_MESSAGE).length).toBeGreaterThanOrEqual(3)
    expect(queryByText(EMPTY_ANALYTICS_MESSAGE)).toBeNull()
    expect(queryByTestId('monthly-trend-chart-svg', { includeHiddenElements: true })).toBeNull()
  })
})
