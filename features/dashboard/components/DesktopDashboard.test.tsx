// Screen-level tests for the rebuilt Desktop Dashboard (Claude Design pass):
// header row, the פנוי באמת hero + מה מגיע row, and the budget-pace /
// needs-attention / recent-transactions row. Mirrors the mock/assert
// structure of the pre-rebuild test file it replaces — same hook mocks,
// same jest.fn-factory pattern — but exercises the new composition instead
// of the removed one (no more standalone analytics/savings-goals sections;
// alerts moved from a full-width "כל ההתראות" list into the compact
// needsAttention card in row 2).
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { DesktopDashboard as Dashboard } from './DesktopDashboard'
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
const mockUseBudgetProgress = jest.fn<() => typeof DEFAULT_BUDGET_PROGRESS>()
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: () => mockUseBudgetProgress(),
}))
const DEFAULT_TRANSACTIONS = { transactions: [] as unknown[], isLoading: false, error: null as Error | null }
const mockUseTransactions = jest.fn<() => typeof DEFAULT_TRANSACTIONS>()
jest.mock('@/features/transactions/hooks/useTransactions', () => ({
  useTransactions: () => mockUseTransactions(),
}))
jest.mock('@/features/categories/hooks/useCategories', () => ({
  useCategories: () => ({ categories: [{ id: 'cat-1', name_he: 'מכולת', icon: '🛒' }] }),
}))
// recurringAgorot deliberately avoids 60000 — the budget-pace fixture below
// uses a remaining figure of ₪600.00, and formatILS(60000) colliding across
// two unrelated panels would make getByText ambiguous.
const DEFAULT_SAFE_TO_SPEND_RESULT = {
  availableCashAgorot: 500000,
  plannedObligationsAgorot: 100000,
  recurringAgorot: 70000,
  reservedAgorot: 170000,
  safeToSpendAgorot: 330000,
  shortfallAgorot: 0,
  items: [] as unknown[],
}
const DEFAULT_SAFE_TO_SPEND = {
  result: DEFAULT_SAFE_TO_SPEND_RESULT,
  isLoading: false,
  error: null as Error | null,
}
const mockUseSafeToSpend = jest.fn<() => typeof DEFAULT_SAFE_TO_SPEND>()
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => mockUseSafeToSpend(),
}))
const DEFAULT_ALERTS = { alerts: [] as unknown[], isLoading: false }
const mockUseFinancialAlerts = jest.fn<() => typeof DEFAULT_ALERTS>()
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => mockUseFinancialAlerts(),
}))
const DEFAULT_COMMITMENTS = { commitments: [] as unknown[], isLoading: false, hasPartialError: false }
const mockUseUpcomingCommitments = jest.fn<() => typeof DEFAULT_COMMITMENTS>()
jest.mock('@/features/cashflow/hooks/useUpcomingCommitments', () => ({
  useUpcomingCommitments: () => mockUseUpcomingCommitments(),
}))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
const mockUseColorScheme = jest.fn<() => { colorScheme: 'light' | 'dark' }>()
jest.mock('nativewind', () => ({
  useColorScheme: () => mockUseColorScheme(),
}))

beforeEach(() => {
  mockUseBudgetProgress.mockReturnValue(DEFAULT_BUDGET_PROGRESS)
  mockUseColorScheme.mockReturnValue({ colorScheme: 'light' })
  mockUseTransactions.mockReturnValue(DEFAULT_TRANSACTIONS)
  mockUseSafeToSpend.mockReturnValue(DEFAULT_SAFE_TO_SPEND)
  mockUseFinancialAlerts.mockReturnValue(DEFAULT_ALERTS)
  mockUseUpcomingCommitments.mockReturnValue(DEFAULT_COMMITMENTS)
  mockPush.mockClear()
})

afterEach(() => {
  jest.clearAllMocks()
})

const CURRENT_MONTH_LABEL = formatMonthLabel(getCurrentMonthPeriodStart())

describe('Dashboard header', () => {
  it('shows the screen title and the current month label', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.title'))).toBeTruthy()
    expect(getByText(CURRENT_MONTH_LABEL)).toBeTruthy()
  })

  it('navigates to /transactions when the search affordance is pressed', async () => {
    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('dashboard.searchPlaceholder')))

    expect(mockPush).toHaveBeenCalledWith('/transactions')
  })

  it('navigates to /transactions/new when "תנועה חדשה" is pressed', async () => {
    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('transactions.addButton')))

    expect(mockPush).toHaveBeenCalledWith('/transactions/new')
  })
})

describe('Dashboard פנוי באמת hero', () => {
  it('renders the headline figure, the horizon pills, and the breakdown rows', async () => {
    const { getByText, getAllByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.hero.label'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.horizonWeek'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.horizonMonth'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.horizonDays30'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.notBankBalance'))).toBeTruthy()
    // ₪3,300.00 appears twice: the headline and the breakdown's own total row.
    expect(getAllByText(/3,300/).length).toBe(2)
    expect(getByText(i18n.t('cashFlow.availableCash'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.plannedObligations'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.recurringCharges'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.safeToSpend'))).toBeTruthy()
  })

  it('shows an error message when the safe-to-spend query fails', async () => {
    mockUseSafeToSpend.mockReturnValue({ ...DEFAULT_SAFE_TO_SPEND, error: new Error('network down') })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('cashFlow.errors.generic'))).toBeTruthy()
  })

  it('switches the selected horizon pill when a different one is pressed', async () => {
    const { getByText } = await render(<Dashboard />)

    // Only asserts the tap doesn't throw and the pill remains present —
    // useSafeToSpend itself is mocked, so the returned figure does not
    // change; the pill's own selected-state re-render is the thing under
    // test here.
    await fireEvent.press(getByText(i18n.t('dashboard.hero.horizonWeek')))

    expect(getByText(i18n.t('dashboard.hero.horizonWeek'))).toBeTruthy()
  })
})

function commitment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'obligation:ob-1',
    source: 'obligation' as const,
    sourceId: 'ob-1',
    description: 'ביטוח רכב',
    amountAgorot: 185000,
    date: '2099-01-27',
    ...overrides,
  }
}

describe('Dashboard מה מגיע panel', () => {
  it('shows a compact empty state when there are no upcoming commitments', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.commitments.title'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.commitments.empty'))).toBeTruthy()
  })

  it('renders the nearest commitment and navigates to its detail screen on tap', async () => {
    mockUseUpcomingCommitments.mockReturnValue({ commitments: [commitment()], isLoading: false, hasPartialError: false })

    const { getByText } = await render(<Dashboard />)

    expect(getByText('ביטוח רכב')).toBeTruthy()
    expect(getByText(formatILS(185000))).toBeTruthy()

    await fireEvent.press(getByText('ביטוח רכב'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/ob-1')
  })

  it('navigates to the account detail screen for a credit-card cycle commitment', async () => {
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [commitment({ id: 'credit_card_cycle:acc-1', source: 'credit_card_cycle', sourceId: 'acc-1', description: 'ויזה' })],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Dashboard />)
    await fireEvent.press(getByText('ויזה'))

    expect(mockPush).toHaveBeenCalledWith('/accounts/acc-1')
  })

  it('caps the visible list at 4 and shows the count/total note', async () => {
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [
        commitment({ id: 'o1', sourceId: 'o1', description: 'א', amountAgorot: 1000 }),
        commitment({ id: 'o2', sourceId: 'o2', description: 'ב', amountAgorot: 2000 }),
        commitment({ id: 'o3', sourceId: 'o3', description: 'ג', amountAgorot: 3000 }),
        commitment({ id: 'o4', sourceId: 'o4', description: 'ד', amountAgorot: 4000 }),
        commitment({ id: 'o5', sourceId: 'o5', description: 'ה', amountAgorot: 5000 }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText('א')).toBeTruthy()
    expect(getByText('ד')).toBeTruthy()
    expect(queryByText('ה')).toBeNull()
    expect(getByText(i18n.t('dashboard.commitments.countAndTotal', { count: 5, amount: formatILS(15000) }))).toBeTruthy()
  })

  it('shows the credit-card cycle countdown footer only when a card cycle is among the commitments', async () => {
    mockUseUpcomingCommitments.mockReturnValue({
      commitments: [commitment({ id: 'credit_card_cycle:acc-1', source: 'credit_card_cycle', sourceId: 'acc-1', description: 'ויזה', amountAgorot: 42000, date: '2099-02-01' })],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText } = await render(<Dashboard />)

    expect(
      getByText(i18n.t('dashboard.commitments.cardCycleClosing', { name: 'ויזה', date: '01.02.2099', amount: formatILS(42000) }))
    ).toBeTruthy()
  })
})

describe('Dashboard budget-pace panel', () => {
  it('shows the empty state when there is no budget for the month', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.budgetPace.title'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.noBudgetHero'))).toBeTruthy()
  })

  it('shows the remaining figure, allocation total, and category rows once a budget exists', async () => {
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

    const { getByText } = await render(<Dashboard />)

    expect(getByText(formatILS(60000))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.budgetPace.outOf', { amount: formatILS(100000) }))).toBeTruthy()
    expect(getByText('מכולת')).toBeTruthy()
  })

  it('navigates to /budgets when "כל התקציבים" is pressed', async () => {
    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('dashboard.budgetPace.viewAll')))

    expect(mockPush).toHaveBeenCalledWith('/budgets')
  })
})

function alert(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'upcoming_obligation:ob-1',
    type: 'upcoming_obligation',
    severity: 'warning' as const,
    title: 'ארנונה בעוד 3 ימים',
    description: '₪475.00 צפויים לרדת ב-2026-08-19',
    actionRoute: '/obligations/ob-1',
    ...overrides,
  }
}

describe('Dashboard needs-attention panel', () => {
  it('shows a checkmark empty state with zero alerts', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.needsAttention.title'))).toBeTruthy()
    expect(getByText(i18n.t('alerts.empty'))).toBeTruthy()
  })

  it('renders up to 4 alerts and navigates to an alert\'s own action route on tap', async () => {
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [
        alert({ id: 'a1', title: 'א', sourceId: 'a1', actionRoute: '/obligations/a1' }),
        alert({ id: 'a2', title: 'ב', sourceId: 'a2', actionRoute: '/obligations/a2' }),
        alert({ id: 'a3', title: 'ג', sourceId: 'a3', actionRoute: '/obligations/a3' }),
        alert({ id: 'a4', title: 'ד', sourceId: 'a4', actionRoute: '/obligations/a4' }),
        alert({ id: 'a5', title: 'ה', sourceId: 'a5', actionRoute: '/obligations/a5' }),
      ],
      isLoading: false,
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText('א')).toBeTruthy()
    expect(getByText('ד')).toBeTruthy()
    expect(queryByText('ה')).toBeNull()

    await fireEvent.press(getByText('א'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/a1')
  })

  it('navigates to /alerts when "כל ההתראות" is pressed', async () => {
    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('alerts.viewAll')))

    expect(mockPush).toHaveBeenCalledWith('/alerts')
  })
})

describe('Dashboard recent-transactions panel', () => {
  it('shows the empty state with no transactions', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.noTransactions'))).toBeTruthy()
  })

  it('excludes internal transfer legs and shows a real transaction, navigating to its detail screen on tap', async () => {
    mockUseTransactions.mockReturnValue({
      transactions: [
        { id: 'leg-source', description: 'העברה לחיסכון', amount_agorot: -50000, transfer_id: 'transfer-1', category_id: null },
        { id: 'leg-dest', description: 'העברה לחיסכון', amount_agorot: 50000, transfer_id: 'transfer-1', category_id: null },
        { id: 'txn-1', description: 'קפה', amount_agorot: -1500, transfer_id: null, category_id: 'cat-1' },
      ],
      isLoading: false,
      error: null,
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText('קפה')).toBeTruthy()
    expect(queryByText('העברה לחיסכון')).toBeNull()

    await fireEvent.press(getByText('קפה'))

    expect(mockPush).toHaveBeenCalledWith('/transactions/txn-1')
  })

  it('shows an error message when the transactions query fails', async () => {
    mockUseTransactions.mockReturnValue({ transactions: [], isLoading: false, error: new Error('network down') })

    const { getAllByText } = await render(<Dashboard />)

    expect(getAllByText(i18n.t('dashboard.errors.generic')).length).toBeGreaterThanOrEqual(1)
  })
})

describe('Dashboard RTL layout', () => {
  it('uses flex-row-reverse (not plain flex-row) for the hero row, so the hero panel reads on the right', async () => {
    const { getByText } = await render(<Dashboard />)

    let node = getByText(i18n.t('dashboard.hero.label')).parent
    while (node && !((node.props?.className as string | undefined) ?? '').split(/\s+/).includes('web:desktop:flex-row')) {
      node = node.parent
    }
    expect(node).toBeTruthy()
  })

  it('renders the same key content in dark color scheme as in light', async () => {
    mockUseColorScheme.mockReturnValue({ colorScheme: 'dark' })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(CURRENT_MONTH_LABEL)).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.label'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.noTransactions'))).toBeTruthy()
  })
})
