// Screen-level tests for the mobile Home composition.
//
// What they protect is the design's contract rather than its pixels: the
// hero shows the engine's own figure and routes to the derivation, a
// critical alert appears while an informational one does not, urgency is
// carried by a word as well as a color, and the budget block never renders
// a bar for a household that has no budget.
//
// The mutable fixtures below are all `mock`-prefixed because jest hoists
// `jest.mock` factories above every declaration in the file and permits
// only that prefix to be referenced from inside them.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import { MobileHome } from './MobileHome'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/auth/hooks/useProfile', () => ({
  useProfile: () => ({ displayName: 'נועם', avatarUrl: null, isLoading: false }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', household: { name: 'משפחת לוי' }, isLoading: false }),
}))

const SAFE_TO_SPEND = {
  availableCashAgorot: 1_310_050,
  plannedObligationsAgorot: 347_000,
  recurringAgorot: 824_600,
  installmentsAgorot: 0,
  reservedAgorot: 1_171_600,
  safeToSpendAgorot: 138_450,
  shortfallAgorot: 0,
  items: [] as unknown[],
}
let mockSafeToSpend = { ...SAFE_TO_SPEND }
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => ({
    result: mockSafeToSpend,
    horizon: { start: '2026-08-22', end: '2026-08-31' },
    isLoading: false,
    error: null,
  }),
}))

let mockCommitments: unknown[] = []
jest.mock('@/features/cashflow/hooks/useUpcomingCommitments', () => ({
  useUpcomingCommitments: () => ({ commitments: mockCommitments, isLoading: false, hasPartialError: false }),
}))

let mockAlerts: unknown[] = []
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => ({ alerts: mockAlerts, isLoading: false, hasPartialError: false }),
}))

const DEFAULT_BUDGET = {
  totalAllocatedAgorot: 870_000,
  totalSpentAgorot: 701_000,
  isLoading: false,
  error: null as Error | null,
}
let mockBudget = { ...DEFAULT_BUDGET }
jest.mock('@/features/budgets/hooks/useBudgetProgress', () => ({
  useBudgetProgress: () => mockBudget,
}))

// The analytics disclosure is closed by default, so its own six-month
// query chain never mounts here — stubbed only so the import resolves.
jest.mock('@/features/dashboard/components/MobileAnalyticsSection', () => ({
  MobileAnalyticsSection: () => null,
}))

function upcoming(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    source: 'obligation',
    sourceId: 'o1',
    description: 'ארנונה דו־חודשית',
    amountAgorot: 122_400,
    sharedAgorot: 122_400,
    personalAgorot: 0,
    date: '2026-08-28',
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

beforeEach(() => {
  mockPush.mockClear()
  mockSafeToSpend = { ...SAFE_TO_SPEND }
  mockCommitments = []
  mockAlerts = []
  mockBudget = { ...DEFAULT_BUDGET }
})

describe('MobileHome — the hero', () => {
  it('renders the engine figure and routes to its derivation when tapped', async () => {
    const { getByText, getByTestId } = await render(<MobileHome />)

    expect(getByText(formatILS(SAFE_TO_SPEND.safeToSpendAgorot))).toBeTruthy()
    // The one thing the design insists the hero says outright.
    expect(getByText(i18n.t('home.hero.notBankBalance'))).toBeTruthy()

    fireEvent.press(getByTestId('home-hero'))
    expect(mockPush).toHaveBeenCalledWith('/safe-to-spend')
  })

  it('shows the shortfall magnitude rather than a negative "spendable"', async () => {
    mockSafeToSpend = { ...SAFE_TO_SPEND, safeToSpendAgorot: -61_200, shortfallAgorot: 61_200 }
    const { getByText, queryByText } = await render(<MobileHome />)

    expect(getByText(formatILS(61_200))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.shortfallTag'))).toBeTruthy()
    // "not the bank balance" reassures about a healthy figure; it has no
    // business sitting beside a shortfall.
    expect(queryByText(i18n.t('home.hero.notBankBalance'))).toBeNull()
  })
})

describe('MobileHome — what needs dealing with', () => {
  it('surfaces a critical alert', async () => {
    mockAlerts = [
      {
        id: 'a1',
        type: 'forecast_shortfall',
        severity: 'critical',
        title: 'ב־04.09 היתרה תרד מתחת לאפס',
        description: 'אגרת הרכב וארנונה באותו שבוע',
        date: '2026-09-04',
        amountAgorot: 61_200,
        source: 'cash_flow_forecast',
        sourceId: null,
        actionRoute: '/cash-flow',
      },
    ]
    const { getByText } = await render(<MobileHome />)

    expect(getByText('ב־04.09 היתרה תרד מתחת לאפס')).toBeTruthy()
  })

  it('leaves an informational insight to the alerts screen', async () => {
    mockAlerts = [
      {
        id: 'a2',
        severity: 'info',
        title: 'בדצמבר יתפנו ₪399 בחודש',
        description: 'תוכנית תשלומים מסתיימת',
        actionRoute: '/installments',
      },
    ]
    const { queryByText } = await render(<MobileHome />)

    // Home carries the one thing that needs doing; everything else waits
    // rather than competing for the front door.
    expect(queryByText('בדצמבר יתפנו ₪399 בחודש')).toBeNull()
  })
})

describe('MobileHome — what comes next', () => {
  it('states urgency in a word, not only in a color', async () => {
    mockCommitments = [upcoming()]
    const { getByText } = await render(<MobileHome />)

    expect(getByText('ארנונה דו־חודשית')).toBeTruthy()
    // Whichever urgency band today falls into, the row carries one of the
    // phrasings rather than a bare colored bar. Matched as a set so the
    // test does not depend on the date the suite happens to run.
    expect(getByText(/בעוד|באיחור|היום|מחר/)).toBeTruthy()
  })

  it('says so plainly when nothing is coming', async () => {
    const { getByText } = await render(<MobileHome />)
    expect(getByText(i18n.t('home.next.empty'))).toBeTruthy()
  })
})

describe('MobileHome — the budget block', () => {
  it('shows what is left, against the allocation', async () => {
    const { getByText } = await render(<MobileHome />)

    expect(getByText(formatILS(870_000 - 701_000))).toBeTruthy()
    expect(getByText(i18n.t('home.budget.remainingOf', { total: formatILS(870_000) }))).toBeTruthy()
  })

  it('invites setting a budget rather than rendering a zeroed bar', async () => {
    mockBudget = { ...DEFAULT_BUDGET, totalAllocatedAgorot: 0, totalSpentAgorot: 0 }
    const { getByText, queryByText } = await render(<MobileHome />)

    expect(getByText(i18n.t('home.budget.empty'))).toBeTruthy()
    // A household with no budget must not be shown a status for one.
    expect(queryByText(i18n.t('home.state.onTrack'))).toBeNull()
    expect(queryByText(i18n.t('home.state.over'))).toBeNull()
  })
})
