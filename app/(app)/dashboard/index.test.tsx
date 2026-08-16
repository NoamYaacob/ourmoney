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
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import Dashboard from './index'
import type { TransactionFilters } from '@/features/transactions/hooks/useTransactions'
import { formatMonthLabel, getCurrentMonthPeriodStart } from '@/features/budgets/lib/budgetPeriod'
import { formatILS } from '@/lib/money/format'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))
const DEFAULT_BUDGET_PROGRESS = {
  categories: [] as unknown[],
  totalAllocatedAgorot: 0,
  totalSpentAgorot: 0,
  isLoading: false,
  error: null as Error | null,
}
const mockUseBudgetProgress =
  jest.fn<(householdId: string | null | undefined, periodStart: string | undefined) => typeof DEFAULT_BUDGET_PROGRESS>()
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: (householdId: string | null | undefined, periodStart: string | undefined) =>
    mockUseBudgetProgress(householdId, periodStart),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [] }),
}))
// Deliberately not 100000/40000/60000/etc — those collide with the budget
// fixtures used elsewhere in this file (e.g. totalAllocatedAgorot: 100000),
// which would make getByText ambiguous once both sections render the same
// formatted string.
const DEFAULT_SAFE_TO_SPEND_RESULT = {
  availableCashAgorot: 777700,
  plannedObligationsAgorot: 0,
  recurringAgorot: 0,
  reservedAgorot: 0,
  safeToSpendAgorot: 777700,
  shortfallAgorot: 0,
  items: [] as unknown[],
}
const DEFAULT_SAFE_TO_SPEND = {
  result: DEFAULT_SAFE_TO_SPEND_RESULT,
  horizon: { kind: 'month' as const, start: '2026-08-16', end: '2026-08-31' },
  isLoading: false,
  error: null as Error | null,
}
const mockUseSafeToSpend = jest.fn<() => typeof DEFAULT_SAFE_TO_SPEND>()
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => mockUseSafeToSpend(),
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
// Mockable colorScheme, defaulted to 'light' below — lets the light/dark
// rendering test (Design Phase 1) flip it per-test without a real
// Appearance/NativeWind runtime, same jest.fn-factory pattern as
// mockUseBudgetProgress/mockUseTransactions above.
const mockUseColorScheme = jest.fn<() => { colorScheme: 'light' | 'dark' }>()
jest.mock('nativewind', () => ({
  useColorScheme: () => mockUseColorScheme(),
}))
// Reset to the shared zero-state default before every test in this file, so
// only the tests that actually need a populated budget/dark scheme have to
// opt in — matches mockAnalytics' per-test override style below.
beforeEach(() => {
  mockUseBudgetProgress.mockReturnValue(DEFAULT_BUDGET_PROGRESS)
  mockUseColorScheme.mockReturnValue({ colorScheme: 'light' })
  mockUseSafeToSpend.mockReturnValue(DEFAULT_SAFE_TO_SPEND)
  mockPush.mockClear()
})

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

  it('shows one combined compact insights state when the 6-month window has zero transactions, not three chart-sized empty blocks', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText, queryByText, queryByTestId } = await render(<Dashboard />)

    // Design Phase 2: the three separate per-section "not enough data"
    // messages collapsed into a single compact insights state (item 4) —
    // the old per-section headings/messages must not appear alongside it.
    expect(getByText(i18n.t('dashboard.analytics.insightsTitle'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.analytics.insightsEmpty'))).toBeTruthy()
    expect(queryByText(i18n.t('dashboard.analytics.trendTitle'))).toBeNull()
    expect(queryByText(i18n.t('dashboard.analytics.breakdownTitle'))).toBeNull()
    expect(queryByText(i18n.t('dashboard.analytics.topCategoriesTitle'))).toBeNull()
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

  it('shows an error message for the insights panel when the analytics query fails, instead of a false empty state', async () => {
    mockAnalytics({ error: new Error('network down') })

    const { getAllByText, queryByText, queryByTestId } = await render(<Dashboard />)

    // Desktop polish pass: the three analytics sub-sections (trend,
    // breakdown, top categories) were consolidated under one "תובנות
    // החודש" panel header — they still share this one query, but a
    // failure now surfaces as the panel's single ErrorMessage instead of
    // three near-identical ones.
    expect(getAllByText(GENERIC_ERROR_MESSAGE).length).toBe(1)
    expect(queryByText(EMPTY_ANALYTICS_MESSAGE)).toBeNull()
    expect(queryByTestId('monthly-trend-chart-svg', { includeHiddenElements: true })).toBeNull()
  })
})

// Design Phase 1 regression coverage: localized month label, and the
// budget-summary/recent-transactions sections' empty vs. populated states
// (the analytics describe block above only ever exercises the zero-budget
// zero-transaction case, since that's not what it's testing).
const CURRENT_MONTH_LABEL = formatMonthLabel(getCurrentMonthPeriodStart())
const NO_BUDGET_MESSAGE = 'עדיין לא הוגדר תקציב לחודש זה.'
const NO_TRANSACTIONS_MESSAGE = 'עדיין אין תנועות החודש.'

describe('Dashboard month navigation and budget summary', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows the localized month label instead of the raw YYYY-MM periodStart', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText(CURRENT_MONTH_LABEL)).toBeTruthy()
    // The raw periodStart's first 7 characters (e.g. "2026-08") must not
    // appear anywhere as visible text — that was the pre-redesign default.
    expect(queryByText(getCurrentMonthPeriodStart().slice(0, 7))).toBeNull()
  })

  it('shows both empty states when there is no budget and no transactions for the month', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(NO_BUDGET_MESSAGE)).toBeTruthy()
    expect(getByText(NO_TRANSACTIONS_MESSAGE)).toBeTruthy()
  })

  it('shows the remaining/spent figures and category progress once a budget and transactions exist', async () => {
    mockUseBudgetProgress.mockReturnValue({
      categories: [
        {
          categoryId: 'cat-1',
          categoryNameHe: 'מכולת',
          categoryIcon: '🛒',
          allocatedAgorot: 100000,
          spentAgorot: 40000,
          remainingAgorot: 60000,
          percentSpent: 40,
        },
      ],
      totalAllocatedAgorot: 100000,
      totalSpentAgorot: 40000,
      isLoading: false,
      error: null,
    })
    mockAnalytics({ transactions: [] })
    mockUseTransactions.mockImplementationOnce((_householdId, filters) => {
      if (filters?.periodEnd) return { transactions: [], isLoading: false, error: null }
      return {
        transactions: [
          {
            id: 'txn-1',
            description: 'קפה',
            amount_agorot: -1500,
          },
        ],
        isLoading: false,
        error: null,
      }
    })

    const { getByText, getAllByText, queryByText } = await render(<Dashboard />)

    expect(getByText(formatILS(60000))).toBeTruthy() // remaining
    expect(getByText(i18n.t('dashboard.spent'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.ofBudget'))).toBeTruthy()
    expect(getByText(formatILS(100000))).toBeTruthy() // out of budget total
    expect(getByText(i18n.t('dashboard.percentUsed', { percent: 40 }))).toBeTruthy()
    // formatILS(40000) is rendered twice — once as the hero's standalone
    // "spent" figure, once inside the category row's "spent / allocated"
    // combined string — getAllByText covers both without over-asserting
    // which one is which.
    expect(getAllByText(formatILS(40000), { exact: false }).length).toBeGreaterThanOrEqual(1)
    expect(getByText('מכולת')).toBeTruthy()
    expect(getByText(i18n.t('dashboard.categoryRemaining', { amount: formatILS(60000) }))).toBeTruthy()
    expect(getByText('קפה')).toBeTruthy()
    expect(getByText(i18n.t('dashboard.viewAll'))).toBeTruthy()
    expect(queryByText(NO_BUDGET_MESSAGE)).toBeNull()
    expect(queryByText(NO_TRANSACTIONS_MESSAGE)).toBeNull()
  })

  it('renders the same key content in dark color scheme as in light', async () => {
    mockUseColorScheme.mockReturnValue({ colorScheme: 'dark' })
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    // Dark mode only swaps token values (see constants/colors.ts) — every
    // NativeWind class carries both a light and a dark variant, so the same
    // content must render regardless of which the tree resolves to.
    expect(getByText(CURRENT_MONTH_LABEL)).toBeTruthy()
    expect(getByText(NO_BUDGET_MESSAGE)).toBeTruthy()
    expect(getByText(NO_TRANSACTIONS_MESSAGE)).toBeTruthy()
  })
})

describe('Dashboard Safe-to-Spend card', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders the safe-to-spend figure, subtitle, and breakdown when positive', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSafeToSpend.mockReturnValue({
      ...DEFAULT_SAFE_TO_SPEND,
      result: {
        availableCashAgorot: 830000,
        plannedObligationsAgorot: 348000,
        recurringAgorot: 140000,
        reservedAgorot: 488000,
        safeToSpendAgorot: 342000,
        shortfallAgorot: 0,
        items: [],
      },
    })

    const { getByText, getAllByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.safeToSpend.title'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.safeToSpend.subtitle'))).toBeTruthy()
    // formatILS carries locale bidi marks (see lib/money/format.test.ts) —
    // match on the digit substring via regex, not exact string equality.
    // ₪3,420.00 appears twice by design: once as the headline, once as the
    // breakdown's own "אפשר להוציא" row.
    expect(getAllByText(/3,420/).length).toBe(2)
    expect(getByText(i18n.t('cashFlow.availableCash'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.plannedObligations'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.recurringCharges'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.safeToSpend'))).toBeTruthy()
  })

  it('shows the shortfall message instead of a negative headline figure when safe-to-spend is negative', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSafeToSpend.mockReturnValue({
      ...DEFAULT_SAFE_TO_SPEND,
      result: {
        availableCashAgorot: 100000,
        plannedObligationsAgorot: 150000,
        recurringAgorot: 0,
        reservedAgorot: 150000,
        safeToSpendAgorot: -50000,
        shortfallAgorot: 50000,
        items: [],
      },
    })

    const { getByText } = await render(<Dashboard />)

    // The headline/breakdown block is a single if/else-if/else JSX chain
    // (safeToSpendAgorot < 0 ? shortfall message : normal headline+
    // breakdown) — this assertion alone is sufficient proof the shortfall
    // branch rendered instead of the raw-number headline branch; a second
    // "the raw negative string is absent" assertion would be redundant at
    // best and actively wrong at worst, since the breakdown section below
    // the headline deliberately DOES still show the real signed total in
    // its own itemized "אפשר להוציא" row (transparency, not the "main CTA"
    // the milestone's negative-headline rule is about).
    expect(getByText(/חסר.*500/)).toBeTruthy()
  })

  it('shows the zero-safe-to-spend message when safe-to-spend is exactly zero', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSafeToSpend.mockReturnValue({
      ...DEFAULT_SAFE_TO_SPEND,
      result: {
        availableCashAgorot: 100000,
        plannedObligationsAgorot: 100000,
        recurringAgorot: 0,
        reservedAgorot: 100000,
        safeToSpendAgorot: 0,
        shortfallAgorot: 0,
        items: [],
      },
    })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.safeToSpend.zero'))).toBeTruthy()
  })

  it('shows an error message when the safe-to-spend query fails', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSafeToSpend.mockReturnValue({ ...DEFAULT_SAFE_TO_SPEND, error: new Error('network down') })

    const { getAllByText } = await render(<Dashboard />)

    expect(getAllByText(i18n.t('cashFlow.errors.generic')).length).toBeGreaterThanOrEqual(1)
  })

  it('navigates to /cash-flow when the card is tapped', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('dashboard.safeToSpend.title')))

    expect(mockPush).toHaveBeenCalledWith('/cash-flow')
  })
})

// Desktop polish pass: below the hero, three equally-weighted columns —
// category budgets, recent transactions, and insights — replaced the
// previous 2/3-main + 1/3-sidebar split. RNTL can't evaluate real CSS media
// queries, so this asserts the structural thing that matters — the
// `web:desktop:flex-row-reverse` grid wrapper genuinely contains all three
// panels, each independently bounded — not a fake pixel/viewport assertion.
// Climbs from a section's title up to its panel wrapper by matching the
// panel's own marker class, rather than a fixed number of `.parent` hops —
// resilient to the exact header markup (icon chip + title row) nested
// inside it.
function climbToPanel(textNode: any) {
  let current = textNode
  while (current && !(current.props?.className ?? '').includes('web:desktop:min-h-[360px]')) {
    current = current.parent
  }
  return current
}

describe('Dashboard responsive desktop layout', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('wraps the category budgets, recent transactions, and insights panels in the same desktop grid container', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    const categoriesPanel = climbToPanel(getByText(i18n.t('dashboard.categoriesTitle')))
    const gridWrapper = categoriesPanel?.parent?.parent
    expect(gridWrapper?.props.className as string).toContain('web:desktop:flex-row')

    const insightsPanel = climbToPanel(getByText(i18n.t('dashboard.analytics.insightsTitle')))
    // All three columns are direct children of the same grid wrapper.
    expect(insightsPanel?.parent?.parent).toBe(gridWrapper)

    const recentPanel = climbToPanel(getByText(i18n.t('dashboard.recentTitle')))
    expect(recentPanel?.parent?.parent).toBe(gridWrapper)
  })

  // Desktop polish pass regression: a real-browser visual check found this
  // grid rendering left-to-right (categories column on the left) — wrong
  // for an RTL app, where the primary column (categories) should read on
  // the right. `flex-row-reverse` keeps source order [categories, recent,
  // insights] (so a screen reader still reaches the primary content first)
  // while flipping only the visual position.
  it('uses flex-row-reverse (not plain flex-row) so the primary column reads on the right in RTL', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    const categoriesPanel = climbToPanel(getByText(i18n.t('dashboard.categoriesTitle')))
    const gridWrapper = categoriesPanel?.parent?.parent
    expect(gridWrapper?.props.className as string).toContain('web:desktop:flex-row-reverse')
  })

  // Desktop polish pass: each lower section (category budgets, recent
  // transactions, analytics/insights) is its own bordered panel at
  // desktop, so the page reads as clearly grouped sections rather than
  // loosely related content on a large blank canvas — see index.tsx's own
  // comment. Asserts the structural fact (the panel class reaches each
  // section's wrapper), not a fake pixel/viewport assertion.
  it('gives the category budgets, recent transactions, and insights sections their own bounded desktop panel', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    expect(climbToPanel(getByText(i18n.t('dashboard.categoriesTitle')))?.props.className as string).toContain('web:desktop:border')
    expect(climbToPanel(getByText(i18n.t('dashboard.recentTitle')))?.props.className as string).toContain('web:desktop:border')
    expect(climbToPanel(getByText(i18n.t('dashboard.analytics.insightsTitle')))?.props.className as string).toContain(
      'web:desktop:border'
    )
  })

  // Debugging pass (real-browser regression): an earlier attempt filled
  // these panels with `bg-surface-light/dark` — the SAME token as the
  // Screen's own root background (confirmed via a real headless-browser
  // measurement: both computed to the identical rgb(250,248,242)) — so the
  // panel had zero fill contrast against the page and was reported as "not
  // visibly rendering," even though its border/media-query classes were
  // genuinely present and applied. `bg-surfaceMuted-light/dark` is the
  // visually-distinct card tone used everywhere else (Card.tsx). This test
  // guards the actual root cause (a specific wrong color token), not just
  // "a background class exists."
  it('fills each desktop panel with the visually-distinct surfaceMuted tone, not the same tone as the page background', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    const className = climbToPanel(getByText(i18n.t('dashboard.categoriesTitle')))?.props.className as string
    expect(className).toContain('web:desktop:bg-surfaceMuted-light')
    expect(className).toContain('dark:web:desktop:bg-surfaceMuted-dark')
    expect(className).not.toContain('web:desktop:bg-surface-light')
    expect(className).not.toContain('web:desktop:bg-surface-dark')
  })

  // Desktop polish pass: each panel's header now carries a small accent-
  // tinted icon chip next to its title (visual hierarchy touch) — desktop
  // only, so it never shows on the mobile stacked layout.
  it('scopes each panel header icon chip to desktop only', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    const titleRow = getByText(i18n.t('dashboard.categoriesTitle')).parent
    const iconChip = titleRow?.children.find(
      (child) => typeof child !== 'string' && (child.props.className as string | undefined)?.includes('rounded-full')
    )
    expect((iconChip as { props: { className: string } } | undefined)?.props.className).toContain('web:desktop:flex')
    expect((iconChip as { props: { className: string } } | undefined)?.props.className).toContain('hidden')
  })
})
