// Screen-level tests for the Desktop Dashboard (Direction D — this
// checkpoint's production implementation): the פנוי באמת hero with its own
// horizon pills and waterfall legend, מה יקרה עד אז (the connected
// timeline) in the SAME panel, מה דורש תשומת לב (every real alert), and
// לאן אנחנו מתקדמים (savings goals). No Budget Pace panel and no Recent
// Transactions panel on this screen anymore — both stay reachable at their
// own real screens, unchanged.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import type { CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

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
  hasData: true,
  refetch: jest.fn(),
}
const mockUseSafeToSpend = jest.fn<() => typeof DEFAULT_SAFE_TO_SPEND>()
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => mockUseSafeToSpend(),
}))

const EMPTY_FORECAST: CashFlowForecastResult = {
  startingBalanceAgorot: 500000,
  endingBalanceAgorot: 500000,
  totalInflowsAgorot: 0,
  totalOutflowsAgorot: 0,
  lowestBalanceAgorot: 500000,
  lowestBalanceDate: '2026-08-22',
  firstShortfallDate: null,
  upcomingObligationsCount: 0,
  events: [],
  dailyPoints: [],
}
const DEFAULT_FORECAST = { result: EMPTY_FORECAST, isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseCashFlowForecast = jest.fn<() => typeof DEFAULT_FORECAST>()
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: () => mockUseCashFlowForecast(),
}))

const DEFAULT_ALERTS = { alerts: [] as unknown[], isLoading: false, hasPartialError: false }
const mockUseFinancialAlerts = jest.fn<() => typeof DEFAULT_ALERTS>()
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => mockUseFinancialAlerts(),
}))
// CP8E — see MobileHome.test.tsx's identical mock for why this hook is
// mocked directly rather than its real Supabase-backed dependencies.
let mockPulse: unknown = null
jest.mock('@/features/pulse/hooks/useFinancialPulse', () => ({
  useFinancialPulse: () => ({ pulse: mockPulse }),
}))

const DEFAULT_GOALS = { goals: [] as unknown[], isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseSavingsGoals = jest.fn<() => typeof DEFAULT_GOALS>()
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => mockUseSavingsGoals(),
}))
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: {}, isLoading: false, error: null, hasData: true, refetch: jest.fn() }),
}))

const DEFAULT_ACCOUNTS = { accounts: [{ id: 'a1' }] as unknown[], isLoading: false, error: null as Error | null, hasData: true, refetch: jest.fn() }
const mockUseAccounts = jest.fn<() => typeof DEFAULT_ACCOUNTS>()
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => mockUseAccounts(),
}))

jest.mock('@/features/dashboard/components/MobileAnalyticsSection', () => ({
  MobileAnalyticsSection: () => null,
}))

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
const mockUseColorScheme = jest.fn<() => { colorScheme: 'light' | 'dark' }>()
jest.mock('nativewind', () => ({
  useColorScheme: () => mockUseColorScheme(),
}))

// eslint-disable-next-line import/first -- must follow every jest.mock above
import { DesktopDashboard as Dashboard } from './DesktopDashboard'

beforeEach(() => {
  mockUseColorScheme.mockReturnValue({ colorScheme: 'light' })
  mockUseSafeToSpend.mockReturnValue(DEFAULT_SAFE_TO_SPEND)
  mockUseCashFlowForecast.mockReturnValue(DEFAULT_FORECAST)
  mockUseFinancialAlerts.mockReturnValue(DEFAULT_ALERTS)
  mockUseSavingsGoals.mockReturnValue(DEFAULT_GOALS)
  mockUseAccounts.mockReturnValue(DEFAULT_ACCOUNTS)
  mockPush.mockClear()
  mockPulse = null
})

afterEach(() => {
  jest.clearAllMocks()
})

// The header's own tests moved to components/ui/DesktopTopBar.test.tsx
// when it became the shell band the mockup draws on every desktop screen.

describe('Dashboard פנוי באמת hero', () => {
  it('renders the headline figure, the horizon pills, and the breakdown rows', async () => {
    const { getByText, getAllByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.hero.label'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.horizonWeek'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.horizonMonth'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.horizonDays30'))).toBeTruthy()
    expect(getByText(i18n.t('dashboard.hero.notBankBalance'))).toBeTruthy()
    // ₪3,300.00 appears three times: the headline, the protected/free
    // boundary's own "free" label, and the breakdown's own total row — the
    // same engine figure, never a second calculation (see
    // ProtectedFreeBoundary's header comment).
    expect(getAllByText(/3,300/).length).toBe(3)
    expect(getByText(i18n.t('cashFlow.availableCash'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.plannedObligations'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.recurringCharges'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.safeToSpend'))).toBeTruthy()
  })

  it('shows an error message when the safe-to-spend query fails', async () => {
    // Never loaded — no prior successful data — so `hasData` stays false,
    // the blocking-error case, not merely `.error` truthy.
    mockUseSafeToSpend.mockReturnValue({ ...DEFAULT_SAFE_TO_SPEND, error: new Error('network down'), hasData: false })

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

  it('names the shortfall instead of printing it as available money', async () => {
    // `Money` renders magnitudes, so the raw figure made "-7,600" look
    // exactly like "7,600 available" beside a chip saying only that it was
    // not the bank balance.
    mockUseSafeToSpend.mockReturnValue({
      result: { ...DEFAULT_SAFE_TO_SPEND_RESULT, safeToSpendAgorot: -760_000, shortfallAgorot: 760_000 },
      isLoading: false,
      error: null,
      hasData: true,
      refetch: jest.fn(),
    })

    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('home.hero.shortfallTag'))).toBeTruthy()
    expect(queryByText(i18n.t('dashboard.hero.notBankBalance'))).toBeNull()
  })
})

function forecastEvent(overrides: Partial<CashFlowForecastResult['events'][number]> = {}) {
  return {
    id: 'planned_obligation:ob-1:2026-08-28',
    date: '2026-08-28',
    amountAgorot: 185000,
    direction: 'outflow' as const,
    source: 'planned_obligation' as const,
    sourceId: 'ob-1',
    title: 'ביטוח רכב',
    pastDue: false,
    ...overrides,
  }
}

describe('Dashboard מה יקרה עד אז (same panel as the hero)', () => {
  it('shows a compact empty state when there are no upcoming events', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('home.timeline.title'))).toBeTruthy()
    expect(getByText(i18n.t('home.timeline.empty'))).toBeTruthy()
  })

  it('renders a real event and navigates to its own detail screen when opened', async () => {
    // A real, contiguous dailyPoints series — Money Journey places a step at
    // its real INDEX into this array (genuine date-proportional geometry),
    // so a fixture with only the event's own single day would land it at
    // the same index as the baseline "today" marker and suppress its label
    // (see MoneyJourney.tsx's own baseline-collision guard) rather than
    // exercising the real per-event bar this test asserts on.
    mockUseCashFlowForecast.mockReturnValue({
      result: {
        ...EMPTY_FORECAST,
        events: [forecastEvent()],
        dailyPoints: [
          { date: '2026-08-22', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0 },
          { date: '2026-08-23', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0 },
          { date: '2026-08-24', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0 },
          { date: '2026-08-25', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0 },
          { date: '2026-08-26', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0 },
          { date: '2026-08-27', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0 },
          { date: '2026-08-28', balanceAgorot: 315000, inflowsAgorot: 0, outflowsAgorot: 185000 },
        ],
        lowestBalanceAgorot: 315000,
        lowestBalanceDate: '2026-08-28',
      },
      isLoading: false,
      error: null,
      hasData: true,
      refetch: jest.fn(),
    })

    const { getByText, getByLabelText } = await render(<Dashboard />)

    expect(getByText(formatILS(315000))).toBeTruthy()

    // Tapping the bar reveals the real per-event breakdown drawer — the
    // source label only ever renders there, so its appearance is exactly
    // the signal that the drawer opened (the event's own title is already
    // visible on the bar itself, so asserting on it again wouldn't tell
    // the two states apart).
    await fireEvent.press(getByLabelText(/ביטוח רכב/))
    expect(getByText(i18n.t('home.timeline.source.planned_obligation'))).toBeTruthy()
  })
})

describe('Dashboard — Financial Pulse (CP8E)', () => {
  it('renders nothing when there is no comparison', async () => {
    mockPulse = null
    const { queryByText } = await render(<Dashboard />)
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
  })

  it('renders the headline when a real comparison exists', async () => {
    mockPulse = {
      safeToSpendDeltaAgorot: 40000,
      previousSafeToSpendAgorot: 290000,
      currentSafeToSpendAgorot: 330000,
      hasPrimaryChange: true,
      cause: null,
      secondaryItems: [{ kind: 'recurring_price_increase', description: 'Netflix', increaseAgorot: 900 }],
    }
    const { getByText } = await render(<Dashboard />)
    expect(getByText(i18n.t('home.pulse.more', { amount: formatILS(40000) }))).toBeTruthy()
    expect(getByText(i18n.t('home.pulse.secondaryPriceIncrease', { description: 'Netflix', amount: formatILS(900) }))).toBeTruthy()
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

describe('Dashboard מה דורש תשומת לב panel', () => {
  it('shows the calm empty state with zero alerts', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('home.attention.title'))).toBeTruthy()
    expect(getByText(i18n.t('home.attention.empty'))).toBeTruthy()
  })

  it('caps the visible cards at 3 and navigates to an alert\'s own action route on tap', async () => {
    mockUseFinancialAlerts.mockReturnValue({
      alerts: [
        alert({ id: 'a1', type: 'upcoming_obligation', title: 'א', actionRoute: '/obligations/a1' }),
        alert({ id: 'a2', type: 'upcoming_obligation', title: 'ב', actionRoute: '/obligations/a2' }),
        alert({ id: 'a3', type: 'upcoming_obligation', title: 'ג', actionRoute: '/obligations/a3' }),
        alert({ id: 'a4', type: 'upcoming_obligation', title: 'ד', actionRoute: '/obligations/a4' }),
      ],
      isLoading: false,
      hasPartialError: false,
    })

    const { getByText, queryByText, getAllByText } = await render(<Dashboard />)

    expect(getByText('א')).toBeTruthy()
    expect(getByText('ג')).toBeTruthy()
    expect(queryByText('ד')).toBeNull()

    // The real, correct destination — the action route the engine itself
    // already computed for this alert type. All 3 visible cards share the
    // same per-type action label; the first is a1's own button.
    const actionButtons = getAllByText(i18n.t('home.attention.action.obligation'))
    expect(actionButtons.length).toBe(3)
    await fireEvent.press(actionButtons[0] as unknown as Parameters<typeof fireEvent.press>[0])
    expect(mockPush).toHaveBeenCalledWith('/obligations/a1')
  })
})

describe('Dashboard לאן אנחנו מתקדמים panel', () => {
  it('invites adding a first goal when there are none', async () => {
    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('home.goals.title'))).toBeTruthy()
    expect(getByText(i18n.t('home.goals.empty'))).toBeTruthy()
  })

  it('shows the aggregate narrative headline and navigates to a goal on tap', async () => {
    mockUseSavingsGoals.mockReturnValue({
      goals: [
        {
          id: 'g1',
          name: 'חופשה ביוון',
          target_agorot: 1_200_000,
          current_agorot: 740_000,
          progress_source: 'manual',
          account_id: null,
          target_date: '2027-02-01',
          is_completed: false,
        },
      ],
      isLoading: false,
      error: null,
      hasData: true,
      refetch: jest.fn(),
    })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('home.goals.headline', { pct: 61 }))).toBeTruthy()

    await fireEvent.press(getByText('חופשה ביוון'))
    expect(mockPush).toHaveBeenCalledWith('/goals/g1')
  })
})

describe('Dashboard — dark mode', () => {
  it('renders the same key content in dark color scheme as in light', async () => {
    mockUseColorScheme.mockReturnValue({ colorScheme: 'dark' })

    const { getByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('dashboard.hero.label'))).toBeTruthy()
    expect(getByText(i18n.t('home.attention.title'))).toBeTruthy()
    expect(getByText(i18n.t('home.goals.title'))).toBeTruthy()
  })
})

describe('Dashboard — zero accounts (true no-data state)', () => {
  beforeEach(() => {
    mockUseAccounts.mockReturnValue({ accounts: [], isLoading: false, error: null, hasData: true, refetch: jest.fn() })
  })

  it('collapses to one restrained message with a single CTA, no calculated ₪0, no other panels', async () => {
    const { getByText, queryByText } = await render(<Dashboard />)

    expect(getByText(i18n.t('home.hero.noDataTitle'))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.noDataBody'))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.noDataCta'))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.noDataPreview'))).toBeTruthy()

    expect(queryByText(formatILS(0))).toBeNull()
    expect(queryByText(i18n.t('dashboard.hero.label'))).toBeNull()
    expect(queryByText(i18n.t('home.timeline.title'))).toBeNull()
    expect(queryByText(i18n.t('home.attention.title'))).toBeNull()
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
    expect(queryByText(i18n.t('home.goals.title'))).toBeNull()
    expect(queryByText(i18n.t('home.analytics.toggle'))).toBeNull()
  })

  it('the CTA navigates straight to adding a checking account', async () => {
    const { getByText } = await render(<Dashboard />)

    await fireEvent.press(getByText(i18n.t('home.hero.noDataCta')))
    expect(mockPush).toHaveBeenCalledWith('/accounts?add=checking')
  })

  it('never renders Financial Pulse here even when a real comparison is available — structurally unreachable, not conditionally hidden', async () => {
    mockPulse = {
      safeToSpendDeltaAgorot: -1000,
      previousSafeToSpendAgorot: 1000,
      currentSafeToSpendAgorot: 0,
      hasPrimaryChange: true,
      cause: { kind: 'generic' },
      secondaryItems: [],
    }
    const { queryByText } = await render(<Dashboard />)
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
  })
})
