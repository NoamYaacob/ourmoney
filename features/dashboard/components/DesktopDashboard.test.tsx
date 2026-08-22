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
import { DesktopDashboard as Dashboard } from './DesktopDashboard'
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
const DEFAULT_ALERTS = { alerts: [] as unknown[], isLoading: false, hasPartialError: false }
const mockUseFinancialAlerts = jest.fn<() => typeof DEFAULT_ALERTS>()
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => mockUseFinancialAlerts(),
}))
const DEFAULT_COMMITMENTS = { commitments: [] as unknown[], isLoading: false, hasPartialError: false }
const mockUseUpcomingCommitments = jest.fn<() => typeof DEFAULT_COMMITMENTS>()
jest.mock('@/features/cashflow/hooks/useUpcomingCommitments', () => ({
  useUpcomingCommitments: () => mockUseUpcomingCommitments(),
}))
const DEFAULT_GOALS = { goals: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseSavingsGoals = jest.fn<() => typeof DEFAULT_GOALS>()
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => mockUseSavingsGoals(),
}))
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: {}, isLoading: false }),
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
  mockUseFinancialAlerts.mockReturnValue(DEFAULT_ALERTS)
  mockUseUpcomingCommitments.mockReturnValue(DEFAULT_COMMITMENTS)
  mockUseSavingsGoals.mockReturnValue(DEFAULT_GOALS)
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
          transfer_id: null,
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

  // UX-completeness audit P2 fix: this hero card previously rendered
  // "נותר החודש ₪0.00 · 0% נוצל" for a household with no budget at all —
  // reading as "you spent nothing against a real ₪0 budget" instead of "no
  // budget exists yet." Distinct copy from the category panel's own
  // dashboard.noBudget message below it (not a verbatim repeat — showing
  // the identical sentence twice on one screen is its own bug).
  it('shows a distinct no-budget message in the hero card, not a duplicate of the category panel below it', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText, getAllByText } = await render(<Dashboard />)

    expect(getByText('הגדירו תקציב חודשי כדי לעקוב כאן אחר מה שנותר להוציא.')).toBeTruthy()
    // The category panel's own message still appears exactly once.
    expect(getAllByText(NO_BUDGET_MESSAGE)).toHaveLength(1)
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
            transfer_id: null,
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

  // Migration 008 (ADR-035): a transfer's two legs share one description —
  // without this exclusion they rendered as two mismatched rows (one
  // green like income, one plain like an expense) with no indication
  // they were the same internal movement (qa-adversarial-reviewer finding).
  it('excludes internal transfer legs from the recent-transactions panel entirely', async () => {
    mockAnalytics({ transactions: [] })
    mockUseTransactions.mockImplementationOnce((_householdId, filters) => {
      if (filters?.periodEnd) return { transactions: [], isLoading: false, error: null }
      return {
        transactions: [
          { id: 'leg-source', description: 'העברה לחיסכון', amount_agorot: -50000, transfer_id: 'transfer-1' },
          { id: 'leg-dest', description: 'העברה לחיסכון', amount_agorot: 50000, transfer_id: 'transfer-1' },
          { id: 'txn-1', description: 'קפה', amount_agorot: -1500, transfer_id: null },
        ],
        isLoading: false,
        error: null,
      }
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText('קפה')).toBeTruthy()
    expect(queryByText('העברה לחיסכון')).toBeNull()
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
// `web:desktop:flex-row` grid wrapper genuinely contains all three
// panels, each independently bounded — not a fake pixel/viewport assertion.
// Climbs from a section's title up to its panel wrapper by matching the
// panel's own marker class, rather than a fixed number of `.parent` hops —
// resilient to the exact header markup (icon chip + title row) nested
// inside it.
function climbToPanel(textNode: any) {
  let current = textNode
  while (current && !(current.props?.className ?? '').includes('web:desktop:min-h-[300px]')) {
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

  // Desktop Visual/Responsive Design pass: Safe-to-Spend and the month-
  // navigator+budget-summary block previously stacked as separate
  // full-width sections — paired into one row at desktop so the top of the
  // page uses width instead of height.
  it('pairs Safe-to-Spend and the budget-summary hero into one desktop row', async () => {
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

    const { getByText } = await render(<Dashboard />)

    const safeToSpendTitle = getByText(i18n.t('dashboard.safeToSpend.title'))
    // Climb from the title up through the Card to the Pressable, then to
    // its column wrapper, then to the shared row.
    let node = safeToSpendTitle.parent
    while (node && !(node.props?.className as string | undefined)?.includes('web:desktop:flex-row')) {
      node = node.parent
    }
    expect(node).toBeTruthy()
    expect(node?.props.className as string).toContain('web:desktop:items-start')

    // The budget hero's own remaining-amount label sits in the row's other
    // column — same shared row ancestor.
    let otherNode = getByText(i18n.t('dashboard.remaining')).parent
    while (otherNode && !(otherNode.props?.className as string | undefined)?.includes('web:desktop:flex-row')) {
      otherNode = otherNode.parent
    }
    expect(otherNode).toBe(node)
  })

  // Dashboard product redesign: alerts (G) is now its own standalone
  // section, positioned AFTER the commitments/this-month/savings row and
  // BEFORE the categories/recent/insights grid — no longer interleaved
  // inside the Safe-to-Spend/budget-hero row via an `order-*` CSS trick
  // (removed along with the trick itself once alerts moved out).
  it('renders alerts as its own section, after the hero row and the commitments/savings row, before the detail grid', async () => {
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
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Dashboard />)

    // No shared flex-row ancestor with Safe-to-Spend/the budget hero — this
    // proves alerts is no longer inside that paired row at all.
    function climbToRow(node: any) {
      let current = node
      while (current && !((current.props?.className as string | undefined) ?? '').includes('web:desktop:flex-row')) {
        current = current.parent
      }
      return current
    }
    const heroRow = climbToRow(getByText(i18n.t('dashboard.safeToSpend.title')))
    const alertsRow = climbToRow(getByText(i18n.t('alerts.dashboardSectionTitle')))
    expect(alertsRow).not.toBe(heroRow)

    // Document order: commitments widget title (part of the second row)
    // still precedes alerts, and alerts precedes the categories panel
    // (the first panel of the bottom detail grid).
    const bodyText = [
      i18n.t('dashboard.commitments.title'),
      i18n.t('alerts.dashboardSectionTitle'),
      i18n.t('dashboard.categoriesTitle'),
    ]
    const indices = bodyText.map((text) => getByText(text))
    expect(indices.every(Boolean)).toBe(true)
  })

  // Desktop polish pass regression: a real-browser visual check found this
  // grid rendering left-to-right (categories column on the left) — wrong
  // for an RTL app, where the primary column (categories) should read on
  // the right. `flex-row-reverse` keeps source order [categories, recent,
  // insights] (so a screen reader still reaches the primary content first)
  // while flipping only the visual position.
  //
  // Visual QA + Desktop Polish pass: this previously matched via
  // `.toContain('web:desktop:flex-row')`, a substring satisfied by BOTH
  // `web:desktop:flex-row` and `web:desktop:flex-row-reverse` — so it
  // silently kept passing through a real regression where the grid
  // reverted to plain, unreversed `flex-row` (categories back on the left).
  // Rewritten to exact whitespace-token membership, which can actually
  // distinguish the two — see app/(app)/_layout.test.tsx's identical fix
  // for the desktop rail wrapper.
  it('uses flex-row-reverse (not plain flex-row) so the primary column reads on the right in RTL', async () => {
    mockAnalytics({ transactions: [] })

    const { getByText } = await render(<Dashboard />)

    const categoriesPanel = climbToPanel(getByText(i18n.t('dashboard.categoriesTitle')))
    const gridWrapper = categoriesPanel?.parent?.parent
    const tokens = ((gridWrapper?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:flex-row-reverse')
    expect(tokens).not.toContain('web:desktop:flex-row')
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

function alert(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'upcoming_obligation:ob-1',
    type: 'upcoming_obligation',
    severity: 'warning',
    title: 'ארנונה בעוד 3 ימים',
    description: '₪475.00 צפויים לרדת ב-2026-08-19',
    date: '2026-08-19',
    amountAgorot: 47500,
    source: 'planned_obligation',
    sourceId: 'ob-1',
    actionRoute: '/obligations/ob-1',
    ...overrides,
  }
}

describe('Dashboard alerts section', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('still shows the header and "כל ההתראות" link with zero current alerts, but no alert list (UX-completeness audit fix: the /alerts screen was previously unreachable from a household with no active alerts)', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({ alerts: [], isLoading: false, hasPartialError: false })

    const { getByText, queryByRole } = await render(<Dashboard />)

    expect(getByText(i18n.t('alerts.dashboardSectionTitle'))).toBeTruthy()
    expect(getByText(i18n.t('alerts.viewAll'))).toBeTruthy()
    // No alert rows are rendered — no "everything's fine" banner either.
    expect(queryByRole('button', { name: /ימים|היום|באיחור/ })).toBeNull()
  })

  it('renders a single alert with its title and description', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('alerts.dashboardSectionTitle'))).toBeTruthy()
    expect(getByText('ארנונה בעוד 3 ימים')).toBeTruthy()
    expect(getByText('₪475.00 צפויים לרדת ב-2026-08-19')).toBeTruthy()
  })

  it('shows at most 3 alerts even when more are available', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [
        alert({ id: 'a1', title: 'התראה 1', sourceId: 'a1', actionRoute: '/obligations/a1' }),
        alert({ id: 'a2', title: 'התראה 2', sourceId: 'a2', actionRoute: '/obligations/a2' }),
        alert({ id: 'a3', title: 'התראה 3', sourceId: 'a3', actionRoute: '/obligations/a3' }),
        alert({ id: 'a4', title: 'התראה 4', sourceId: 'a4', actionRoute: '/obligations/a4' }),
        alert({ id: 'a5', title: 'התראה 5', sourceId: 'a5', actionRoute: '/obligations/a5' }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText('התראה 1')).toBeTruthy()
    expect(getByText('התראה 2')).toBeTruthy()
    expect(getByText('התראה 3')).toBeTruthy()
    expect(queryByText('התראה 4')).toBeNull()
    expect(queryByText('התראה 5')).toBeNull()
  })

  it('preserves the order the engine already sorted (highest priority first)', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [
        alert({ id: 'a1', severity: 'critical', title: 'קריטי', sourceId: 'a1', actionRoute: '/obligations/a1' }),
        alert({ id: 'a2', severity: 'warning', title: 'אזהרה', sourceId: 'a2', actionRoute: '/obligations/a2' }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Dashboard />)

    const critical = getByText('קריטי')
    const warning = getByText('אזהרה')
    // Both rendered; order in the source array is preserved (the screen
    // never re-sorts — buildFinancialAlerts.ts already did).
    expect(critical).toBeTruthy()
    expect(warning).toBeTruthy()
  })

  it('navigates to /alerts when "כל ההתראות" is tapped', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('alerts.viewAll')))

    expect(mockPush).toHaveBeenCalledWith('/alerts')
  })

  it('navigates to the alert\'s own actionRoute when the alert row is tapped', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText('ארנונה בעוד 3 ימים'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/ob-1')
  })

  it('does not render the section while alerts are still loading', async () => {
    mockAnalytics({ transactions: [] })
    mockUseFinancialAlerts.mockReturnValue({ alerts: [alert()], isLoading: true, hasPartialError: false })

    const { queryByText } = await render(<Dashboard />)

    expect(queryByText(i18n.t('alerts.dashboardSectionTitle'))).toBeNull()
  })
})

// Comprehensive upgrade pass §2/§9/§11: this-month income/expense figures,
// the upcoming-obligations widget, and the savings-goals widget — all three
// reuse existing hooks/pure helpers (see app/(app)/dashboard/index.tsx's own
// comments), so these tests only cover the screen-level wiring, not the
// underlying calculations (those are covered by their own dedicated test
// files: monthlyTrend.test.ts, upcomingObligations.test.ts, goalProgress
// via lib/money/arithmetic.test.ts).
describe('Dashboard this-month income/expense widget', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows the current month\'s income and expense totals, derived from the same transactions the trend chart uses', async () => {
    mockAnalytics({
      transactions: [
        {
          id: 'txn-income',
          category_id: null,
          amount_agorot: 300000,
          txn_date: '2026-08-05',
          is_shared: true,
          is_excluded: false,
          transfer_id: null,
          description: 'משכורת',
        },
        {
          id: 'txn-expense',
          category_id: null,
          amount_agorot: -12000,
          txn_date: '2026-08-06',
          is_shared: true,
          is_excluded: false,
          transfer_id: null,
          description: 'קניות',
        },
      ],
    })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.thisMonth.title'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.analytics.income'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.analytics.expense'))).toBeTruthy()
    expect(getByText(formatILS(300000))).toBeTruthy()
    expect(getByText(formatILS(12000))).toBeTruthy()
  })

  it('shows ₪0.00 for both figures, never a negative sign, when the month has no transactions', async () => {
    mockAnalytics({ transactions: [] })

    const { getAllByText } = await render(<Dashboard />)

    expect(formatILS(0)).not.toContain('-')
    // Not an exact count: the mocked Safe-to-Spend breakdown also renders
    // its own zero figures. This only asserts the this-month widget's two
    // (income, expense) are among them, never a "-₪0.00".
    expect(getAllByText(formatILS(0)).length).toBeGreaterThanOrEqual(2)
  })
})

function commitment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'obligation:ob-1',
    source: 'obligation' as const,
    sourceId: 'ob-1',
    description: 'ביטוח רכב',
    amountAgorot: 185000,
    sharedAgorot: 185000,
    personalAgorot: 0,
    date: '2026-08-27',
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

describe('Dashboard upcoming commitments widget', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows a compact empty state when there are no upcoming commitments', async () => {
    mockAnalytics({ transactions: [] })
    mockUseUpcomingCommitments.mockReturnValue({ commitments: [], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.commitments.title'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.commitments.empty'))).toBeTruthy()
  })

  it('renders the nearest commitment with its description and amount, and navigates to its detail screen on tap', async () => {
    mockAnalytics({ transactions: [] })
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [commitment()],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Dashboard />)

    expect(getByText('ביטוח רכב')).toBeTruthy()
    expect(getByText(formatILS(185000))).toBeTruthy()

    await fireEvent.press(getByText('ביטוח רכב'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/ob-1')
  })

  it('navigates to the correct detail route per commitment source', async () => {
    mockAnalytics({ transactions: [] })
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [
        commitment({
          id: 'credit_card_cycle:acc-cc-1',
          source: 'credit_card_cycle',
          sourceId: 'acc-cc-1',
          description: 'ויזה',
        }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Dashboard />)
    await fireEvent.press(getByText('ויזה'))

    expect(mockPush).toHaveBeenCalledWith('/accounts/acc-cc-1')
  })

  it('caps the list at 3 even when more commitments are available', async () => {
    mockAnalytics({ transactions: [] })
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [
        commitment({ id: 'o1', sourceId: 'o1', description: 'א', date: '2026-08-22' }),
        commitment({ id: 'o2', sourceId: 'o2', description: 'ב', date: '2026-08-23' }),
        commitment({ id: 'o3', sourceId: 'o3', description: 'ג', date: '2026-08-24' }),
        commitment({ id: 'o4', sourceId: 'o4', description: 'ד', date: '2026-08-25' }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText('א')).toBeTruthy()
    expect(getByText('ב')).toBeTruthy()
    expect(getByText('ג')).toBeTruthy()
    expect(queryByText('ד')).toBeNull()
  })

  it('shows a credit-card burden callout when the commitments include a credit-card cycle item', async () => {
    mockAnalytics({ transactions: [] })
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [
        commitment({
          id: 'credit_card_cycle:acc-cc-1',
          source: 'credit_card_cycle',
          sourceId: 'acc-cc-1',
          description: 'ויזה',
          amountAgorot: 42000,
        }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Dashboard />)

    expect(
      getByText(i18n.t('dashboard.commitments.creditCardBurden', { amount: formatILS(42000) }))
    ).toBeTruthy()
  })
})

function savingsGoal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'goal-1',
    name: 'חופשה',
    current_agorot: 50000,
    target_agorot: 200000,
    is_completed: false,
    ...overrides,
  }
}

describe('Dashboard savings goals widget', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('shows a compact empty state when there are no savings goals', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSavingsGoals.mockReturnValue({ goals: [], isLoading: false, error: null })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.savingsGoalsWidget.title'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.savingsGoalsWidget.empty'))).toBeTruthy()
  })

  it('renders a goal with its saved/target amounts, and navigates to its detail screen on tap', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSavingsGoals.mockReturnValue({ goals: [savingsGoal()], isLoading: false, error: null })

    const { getByText } = await render(<Dashboard />)

    expect(getByText('חופשה')).toBeTruthy()
    expect(getByText(`${formatILS(50000)} / ${formatILS(200000)}`)).toBeTruthy()

    await fireEvent.press(getByText('חופשה'))

    expect(mockPush).toHaveBeenCalledWith('/goals/goal-1')
  })

  it('excludes already-completed goals from the widget', async () => {
    mockAnalytics({ transactions: [] })
    mockUseSavingsGoals.mockReturnValue({
      goals: [savingsGoal({ id: 'g1', name: 'הושלם', is_completed: true })],
      isLoading: false,
      error: null,
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.savingsGoalsWidget.empty'))).toBeTruthy()
    expect(queryByText('הושלם')).toBeNull()
  })
})
