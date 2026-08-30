// Screen-level tests for the mobile Home composition (Direction D).
//
// What they protect is the design's contract rather than its pixels: the
// hero shows the engine's own figure and routes to the derivation, the
// timeline shows a real forecast event and its resulting balance, every
// real alert appears (not just the critical one), and a goal's progress
// figure is the engine's own.
//
// The mutable fixtures below are all `mock`-prefixed because jest hoists
// `jest.mock` factories above every declaration in the file and permits
// only that prefix to be referenced from inside them.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import type { CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'
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
    hasData: true,
    refetch: jest.fn(),
  }),
}))

const EMPTY_FORECAST: CashFlowForecastResult = {
  startingBalanceAgorot: 1_310_050,
  endingBalanceAgorot: 1_310_050,
  totalInflowsAgorot: 0,
  totalOutflowsAgorot: 0,
  lowestBalanceAgorot: 1_310_050,
  lowestBalanceDate: '2026-08-22',
  firstShortfallDate: null,
  upcomingObligationsCount: 0,
  events: [],
  dailyPoints: [],
}
let mockForecast: CashFlowForecastResult = { ...EMPTY_FORECAST }
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: () => ({
    result: mockForecast,
    horizon: { days: 30, start: '2026-08-22', end: '2026-09-20' },
    isLoading: false,
    error: null,
    hasData: true,
    refetch: jest.fn(),
  }),
}))

let mockAlerts: unknown[] = []
jest.mock('@/features/alerts/hooks/useFinancialAlerts', () => ({
  useFinancialAlerts: () => ({ alerts: mockAlerts, isLoading: false, hasPartialError: false }),
}))
// CP8E — this screen's tests care about composition, not Financial Pulse's
// own correctness (covered by lib/engines/pulse/computeFinancialPulse.test.ts
// and features/pulse/hooks/useFinancialPulse.test.ts). Mocking the
// composition hook directly here also avoids pulling in useTransactions'
// real Supabase client import, which throws outside a configured env.
let mockPulse: unknown = null
jest.mock('@/features/pulse/hooks/useFinancialPulse', () => ({
  useFinancialPulse: () => ({ pulse: mockPulse }),
}))

let mockGoals: unknown[] = []
jest.mock('@/features/savings/hooks/useSavingsGoals', () => ({
  useSavingsGoals: () => ({ goals: mockGoals, isLoading: false, error: null, hasData: true, refetch: jest.fn() }),
}))
jest.mock('@/features/accounts/hooks/useAccountBalances', () => ({
  useAccountBalances: () => ({ balances: {}, isLoading: false, error: null, hasData: true, refetch: jest.fn() }),
}))

// Defaults to "has an account" so every existing test exercises the normal
// composition; the zero-account describe block below overrides this to [].
let mockAccounts: unknown[] = [{ id: 'a1' }]
jest.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({ accounts: mockAccounts, isLoading: false, error: null, hasData: true, refetch: jest.fn() }),
}))

// The analytics disclosure is closed by default, so its own six-month
// query chain never mounts here — stubbed only so the import resolves.
jest.mock('@/features/dashboard/components/MobileAnalyticsSection', () => ({
  MobileAnalyticsSection: () => null,
}))

function forecastEvent(overrides: Partial<CashFlowForecastResult['events'][number]> = {}) {
  return {
    id: 'planned_obligation:o1:2026-08-28',
    date: '2026-08-28',
    amountAgorot: 122_400,
    direction: 'outflow' as const,
    source: 'planned_obligation' as const,
    sourceId: 'o1',
    title: 'ארנונה דו־חודשית',
    pastDue: false,
    ...overrides,
  }
}

beforeEach(() => {
  mockPush.mockClear()
  mockSafeToSpend = { ...SAFE_TO_SPEND }
  mockForecast = { ...EMPTY_FORECAST }
  mockAlerts = []
  mockGoals = []
  mockAccounts = [{ id: 'a1' }]
  mockPulse = null
})

describe('MobileHome — the hero', () => {
  it('renders the engine figure and routes to its derivation when tapped', async () => {
    const { getAllByText, getByText, getByTestId } = await render(<MobileHome />)

    // The hero figure and the protected/free boundary's own "free" label
    // both show the engine's safeToSpendAgorot — same figure, same source,
    // never a second calculation (see ProtectedFreeBoundary's header).
    expect(getAllByText(formatILS(SAFE_TO_SPEND.safeToSpendAgorot)).length).toBe(2)
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

describe('MobileHome — מה יקרה עד אז (Money Journey)', () => {
  it('shows a real forecast event and the resulting balance, chronologically after today', async () => {
    // A real, contiguous dailyPoints series (one entry per calendar day from
    // today through the event date) — Money Journey's own date-proportional
    // geometry reads a step's position from its real INDEX into this array,
    // so a fixture with only the event's own day (as the old
    // FinancialTimeline fixture used) would not exercise the real component
    // the same way production data does.
    mockForecast = {
      ...EMPTY_FORECAST,
      events: [forecastEvent()],
      dailyPoints: [
        { date: '2026-08-22', balanceAgorot: 1_310_050, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-23', balanceAgorot: 1_310_050, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-24', balanceAgorot: 1_310_050, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-25', balanceAgorot: 1_310_050, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-26', balanceAgorot: 1_310_050, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-27', balanceAgorot: 1_310_050, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-28', balanceAgorot: 1_187_650, inflowsAgorot: 0, outflowsAgorot: 122_400 },
      ],
      lowestBalanceAgorot: 1_187_650,
      lowestBalanceDate: '2026-08-28',
    }
    const { getByText } = await render(<MobileHome />)

    // This event's date is also the forecast's lowest-balance date, so its
    // cause is suffixed with the low-point marker — same as the approved
    // artifact's "חדר כושר · שפל" treatment.
    expect(getByText(`ארנונה דו־חודשית · ${i18n.t('home.timeline.lowSuffix')}`)).toBeTruthy()
    expect(getByText(formatILS(1_187_650))).toBeTruthy()
    expect(getByText(i18n.t('home.timeline.today'))).toBeTruthy()
  })

  it('says so plainly when nothing is coming', async () => {
    const { getByText } = await render(<MobileHome />)
    expect(getByText(i18n.t('home.timeline.empty'))).toBeTruthy()
  })
})

describe('MobileHome — Financial Pulse (CP8E)', () => {
  it('renders nothing when there is no comparison (first visit / nothing changed)', async () => {
    mockPulse = null
    const { queryByText } = await render(<MobileHome />)
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
  })

  it('renders the headline and "since last time" note when a real comparison exists', async () => {
    mockPulse = {
      safeToSpendDeltaAgorot: -62000,
      previousSafeToSpendAgorot: 200450,
      currentSafeToSpendAgorot: 138450,
      cause: { kind: 'generic' },
      secondaryItems: [],
    }
    const { getByText } = await render(<MobileHome />)
    expect(getByText(i18n.t('home.pulse.less', { amount: formatILS(62000) }))).toBeTruthy()
    expect(getByText(i18n.t('home.pulse.sinceLastTime'))).toBeTruthy()
    expect(getByText(i18n.t('home.pulse.causeGeneric'))).toBeTruthy()
  })
})

describe('MobileHome — מה דורש תשומת לב', () => {
  it('surfaces every real alert, not only the critical one', async () => {
    mockAlerts = [
      {
        id: 'a1',
        type: 'forecast_shortfall',
        severity: 'critical',
        title: 'ב־04.09 היתרה תרד מתחת לאפס',
        description: 'אגרת הרכב וארנונה באותו שבוע',
        date: '2026-09-04',
        amountAgorot: 61_200,
        source: 'cash_flow',
        sourceId: null,
        actionRoute: '/cash-flow',
      },
      {
        id: 'a2',
        type: 'excess_cash_available',
        severity: 'info',
        title: 'יש לכם עודף פנוי החודש',
        description: 'אפשר להאיץ יעד בלי לסכן את החודש',
        date: null,
        amountAgorot: 130_000,
        source: 'cash_flow',
        sourceId: null,
        actionRoute: '/goals',
      },
    ]
    const { getByText } = await render(<MobileHome />)

    expect(getByText('ב־04.09 היתרה תרד מתחת לאפס')).toBeTruthy()
    // Direction D shows the full alert list on Home (up to 3 cards), not
    // just the top-severity one the previous single-card composition kept.
    expect(getByText('יש לכם עודף פנוי החודש')).toBeTruthy()
  })

  it('shows the calm state when nothing needs attention', async () => {
    const { getByText } = await render(<MobileHome />)
    expect(getByText(i18n.t('home.attention.empty'))).toBeTruthy()
  })
})

describe('MobileHome — לאן אנחנו מתקדמים', () => {
  it('renders the aggregate narrative headline from the real goal figures', async () => {
    mockGoals = [
      { id: 'g1', name: 'חופשה ביוון', target_agorot: 1_200_000, current_agorot: 740_000, progress_source: 'manual', account_id: null, target_date: '2027-02-01', is_completed: false },
    ]
    const { getByText } = await render(<MobileHome />)

    expect(getByText('חופשה ביוון')).toBeTruthy()
    expect(getByText(i18n.t('home.goals.headline', { pct: 61 }))).toBeTruthy()
  })

  it('invites adding a first goal rather than rendering an empty aggregate', async () => {
    const { getByText } = await render(<MobileHome />)
    expect(getByText(i18n.t('home.goals.empty'))).toBeTruthy()
  })
})

describe('MobileHome — zero accounts (true no-data state)', () => {
  beforeEach(() => {
    mockAccounts = []
  })

  it('collapses to one restrained message with a single CTA, no calculated ₪0, no other panels', async () => {
    const { getByText, queryByText, queryByTestId } = await render(<MobileHome />)

    expect(getByText(i18n.t('home.hero.noDataTitle'))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.noDataBody'))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.noDataCta'))).toBeTruthy()
    expect(getByText(i18n.t('home.hero.noDataPreview'))).toBeTruthy()

    // Never a calculated-looking ₪0.00 standing in for "nothing to
    // calculate from yet".
    expect(queryByText(formatILS(0))).toBeNull()

    // None of the four sections a household WITH accounts still gets its
    // own empty state for — this is a different, earlier state.
    expect(queryByText(i18n.t('home.timeline.title'))).toBeNull()
    expect(queryByText(i18n.t('home.attention.title'))).toBeNull()
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
    expect(queryByText(i18n.t('home.goals.title'))).toBeNull()
    expect(queryByText(i18n.t('home.analytics.toggle'))).toBeNull()
    expect(queryByTestId('home-hero')).toBeNull()
  })

  it('the CTA navigates straight to adding a checking account', async () => {
    const { getByText } = await render(<MobileHome />)

    fireEvent.press(getByText(i18n.t('home.hero.noDataCta')))
    expect(mockPush).toHaveBeenCalledWith('/accounts?add=checking')
  })

  it('never renders Financial Pulse here even when a real comparison is available — structurally unreachable, not conditionally hidden', async () => {
    mockPulse = {
      safeToSpendDeltaAgorot: -1000,
      previousSafeToSpendAgorot: 1000,
      currentSafeToSpendAgorot: 0,
      cause: { kind: 'generic' },
      secondaryItems: [],
    }
    const { queryByText } = await render(<MobileHome />)
    expect(queryByText(i18n.t('home.pulse.sinceLastTime'))).toBeNull()
  })
})
