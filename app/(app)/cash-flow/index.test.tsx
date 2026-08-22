import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import CashFlow from './index'
import type { HorizonKind } from '@/lib/engines/cashflow/horizonRange'
import type { CashFlowForecastEvent } from '@/lib/engines/cashflow/calculateCashFlowForecast'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))

const DEFAULT_RESULT = {
  availableCashAgorot: 830000,
  plannedObligationsAgorot: 47500,
  recurringAgorot: 15000,
  reservedAgorot: 62500,
  safeToSpendAgorot: 767500,
  shortfallAgorot: 0,
  items: [
    { sourceType: 'recurring' as const, sourceId: 'rec-1', description: 'אינטרנט', amountAgorot: 15000, date: '2026-09-18', categoryId: null, accountId: null },
    { sourceType: 'obligation' as const, sourceId: 'ob-1', description: 'ארנונה', amountAgorot: 47500, date: '2026-09-10', categoryId: null, accountId: null },
  ],
}
const mockUseSafeToSpend = jest.fn<
  (householdId: string | null | undefined, horizonKind: HorizonKind) => {
    result: typeof DEFAULT_RESULT
    horizon: { kind: HorizonKind; start: string; end: string }
    isLoading: boolean
    error: Error | null
  }
>()
jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: (householdId: string | null | undefined, horizonKind: HorizonKind) =>
    mockUseSafeToSpend(householdId, horizonKind),
}))

function defaultResult(overrides: Partial<typeof DEFAULT_RESULT> = {}) {
  return {
    result: { ...DEFAULT_RESULT, ...overrides },
    horizon: { kind: 'month' as const, start: '2026-08-16', end: '2026-08-31' },
    isLoading: false,
    error: null as Error | null,
  }
}

const DEFAULT_FORECAST_RESULT = {
  startingBalanceAgorot: 830000,
  endingBalanceAgorot: 1580000,
  totalInflowsAgorot: 850000,
  totalOutflowsAgorot: 100000,
  lowestBalanceAgorot: 730000,
  lowestBalanceDate: '2026-08-20',
  firstShortfallDate: null as string | null,
  upcomingObligationsCount: 1,
  events: [
    {
      id: 'recurring:rec-salary:2026-09-10',
      date: '2026-09-10',
      amountAgorot: 850000,
      direction: 'inflow',
      source: 'recurring',
      sourceId: 'rec-salary',
      title: 'משכורת',
      pastDue: false,
    },
    {
      id: 'planned_obligation:ob-rent:2026-08-20',
      date: '2026-08-20',
      amountAgorot: 100000,
      direction: 'outflow',
      source: 'planned_obligation',
      sourceId: 'ob-rent',
      title: 'שכר דירה',
      pastDue: false,
    },
  ] as CashFlowForecastEvent[],
  dailyPoints: Array.from({ length: 30 }, (_, i) => {
    const date = new Date(2026, 7, 16 + i)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { date: iso, balanceAgorot: 830000, inflowsAgorot: 0, outflowsAgorot: 0 }
  }),
}

function defaultForecastResult(overrides: Partial<typeof DEFAULT_FORECAST_RESULT> = {}) {
  return {
    result: { ...DEFAULT_FORECAST_RESULT, ...overrides },
    horizon: { days: 30, start: '2026-08-16', end: '2026-09-14' },
    isLoading: false,
    error: null as Error | null,
  }
}
const mockUseCashFlowForecast = jest.fn<
  (householdId: string | null | undefined, horizonDays: number) => {
    result: typeof DEFAULT_FORECAST_RESULT
    horizon: { days: number; start: string; end: string }
    isLoading: boolean
    error: Error | null
  }
>()
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: (householdId: string | null | undefined, horizonDays: number) =>
    mockUseCashFlowForecast(householdId, horizonDays),
}))

describe('CashFlow detail screen', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockUseSafeToSpend.mockReset()
    mockUseSafeToSpend.mockReturnValue(defaultResult())
    mockUseCashFlowForecast.mockReset()
    mockUseCashFlowForecast.mockReturnValue(defaultForecastResult())
  })

  it('renders the full breakdown: available cash, obligations, recurring, reserved, safe-to-spend', async () => {
    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.availableCash'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.plannedObligations'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.recurringCharges'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.reserved'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.safeToSpend'))).toBeTruthy()
    expect(getAllByText(/7,675/).length).toBeGreaterThanOrEqual(1) // ₪7,675.00 safe-to-spend
  })

  it('renders the itemized list sorted by date with correct source labels', async () => {
    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText('ארנונה')).toBeTruthy()
    expect(getByText('אינטרנט')).toBeTruthy()
    // "התחייבות" is the shared label text for both this section's own items
    // AND the forecast section's planned_obligation events below it (its
    // default fixture includes one) — at least one occurrence is this
    // section's, not necessarily exactly one on the whole screen.
    expect(getAllByText(i18n.t('cashFlow.source.obligation')).length).toBeGreaterThanOrEqual(1)
    expect(getAllByText(i18n.t('cashFlow.source.recurring')).length).toBeGreaterThanOrEqual(1)
  })

  it('shows the empty state when there are no reserved items', async () => {
    mockUseSafeToSpend.mockReturnValue(defaultResult({ items: [], plannedObligationsAgorot: 0, recurringAgorot: 0, reservedAgorot: 0 }))

    const { getByText, queryByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.empty'))).toBeTruthy()
    expect(queryByText('ארנונה')).toBeNull()
  })

  it('shows the shortfall message when safe-to-spend is negative', async () => {
    mockUseSafeToSpend.mockReturnValue(
      defaultResult({ availableCashAgorot: 10000, safeToSpendAgorot: -52500, shortfallAgorot: 52500 })
    )

    const { getByText } = await render(<CashFlow />)

    expect(getByText(/חסר.*525/)).toBeTruthy()
  })

  it('shows an error message when the query fails', async () => {
    mockUseSafeToSpend.mockReturnValue({ ...defaultResult(), error: new Error('network down') })

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.errors.generic'))).toBeTruthy()
  })

  it('navigates to the obligation detail screen when an obligation item is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('ארנונה'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/ob-1')
  })

  it('navigates to the recurring detail screen when a recurring item is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('אינטרנט'))

    expect(mockPush).toHaveBeenCalledWith('/recurring/rec-1')
  })

  it('switches horizon and re-queries useSafeToSpend with the new horizon kind', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText(i18n.t('cashFlow.horizon.week')))

    expect(mockUseSafeToSpend).toHaveBeenLastCalledWith('household-1', 'week')
  })

  it('defaults to the month horizon on first render', async () => {
    await render(<CashFlow />)

    expect(mockUseSafeToSpend).toHaveBeenCalledWith('household-1', 'month')
  })
})

describe('CashFlow forecast section', () => {
  beforeEach(() => {
    mockPush.mockClear()
    mockUseSafeToSpend.mockReset()
    mockUseSafeToSpend.mockReturnValue(defaultResult())
    mockUseCashFlowForecast.mockReset()
    mockUseCashFlowForecast.mockReturnValue(defaultForecastResult())
  })

  it('renders the starting, ending, and lowest balance summary', async () => {
    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.availableCashToday'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.forecast.projectedEndingBalance'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.forecast.lowestBalance'))).toBeTruthy()
    expect(getAllByText(/8,300/).length).toBeGreaterThanOrEqual(1) // starting ₪8,300.00
    expect(getAllByText(/15,800/).length).toBeGreaterThanOrEqual(1) // ending ₪15,800.00
  })

  it('renders the forecast chart', async () => {
    const { getByTestId } = await render(<CashFlow />)

    expect(getByTestId('cash-flow-forecast-chart-svg', { includeHiddenElements: true })).toBeTruthy()
  })

  it('renders the upcoming events list with correct source labels for obligation, recurring expense, and recurring income', async () => {
    mockUseCashFlowForecast.mockReturnValue(
      defaultForecastResult({
        events: [
          ...DEFAULT_FORECAST_RESULT.events,
          {
            id: 'recurring:rec-electric:2026-08-18',
            date: '2026-08-18',
            amountAgorot: 15000,
            direction: 'outflow',
            source: 'recurring',
            sourceId: 'rec-electric',
            title: 'חשמל',
            pastDue: false,
          } satisfies CashFlowForecastEvent,
        ],
      })
    )

    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText('משכורת')).toBeTruthy()
    expect(getByText('שכר דירה')).toBeTruthy()
    expect(getByText('חשמל')).toBeTruthy()
    // "התחייבות"/"חיוב קבוע" text also appears in the Safe-to-Spend section
    // above (same underlying Hebrew label, different i18n namespace) — at
    // least one occurrence is enough to prove this section rendered it.
    expect(getAllByText(i18n.t('cashFlow.forecast.source.planned_obligation')).length).toBeGreaterThanOrEqual(1)
    expect(getByText(i18n.t('cashFlow.forecast.source.recurringIncome'))).toBeTruthy()
    expect(getAllByText(i18n.t('cashFlow.forecast.source.recurring')).length).toBeGreaterThanOrEqual(1)
  })

  it('shows a pastDue label on an overdue event', async () => {
    mockUseCashFlowForecast.mockReturnValue(
      defaultForecastResult({
        events: [{ ...DEFAULT_FORECAST_RESULT.events[1]!, pastDue: true }],
      })
    )

    const { getByText } = await render(<CashFlow />)

    expect(getByText(new RegExp(i18n.t('cashFlow.forecast.pastDue')))).toBeTruthy()
  })

  it('shows a positive-signed amount for an inflow event and a negative-signed amount for an outflow event', async () => {
    const { getByText } = await render(<CashFlow />)

    expect(getByText(/\+.*8,500/)).toBeTruthy() // +₪8,500.00 salary
    expect(getByText(/1,000/)).toBeTruthy() // ₪1,000.00 rent (no leading +)
  })

  it('navigates to the obligation detail screen when a planned_obligation forecast event is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('שכר דירה'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/ob-rent')
  })

  it('navigates to the recurring detail screen when a recurring forecast event is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('משכורת'))

    expect(mockPush).toHaveBeenCalledWith('/recurring/rec-salary')
  })

  it('shows the shortfall warning when a shortfall is projected', async () => {
    mockUseCashFlowForecast.mockReturnValue(
      defaultForecastResult({ firstShortfallDate: '2026-08-25', lowestBalanceAgorot: -124000 })
    )

    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.shortfallWarningTitle'))).toBeTruthy()
    expect(getByText(/2026-08-25/)).toBeTruthy()
    // ₪1,240.00 appears twice by design: once in the lowest-balance summary
    // row, once in the shortfall warning's own "חסר עד" line.
    expect(getAllByText(/1,240/).length).toBe(2)
  })

  it('shows the no-shortfall state when the balance never dips below zero', async () => {
    const { getByText, queryByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.noShortfall'))).toBeTruthy()
    expect(queryByText(i18n.t('cashFlow.forecast.shortfallWarningTitle'))).toBeNull()
  })

  it('shows the empty state when there are no forecast events', async () => {
    mockUseCashFlowForecast.mockReturnValue(defaultForecastResult({ events: [] }))

    const { getByText, queryByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.empty'))).toBeTruthy()
    expect(queryByText('משכורת')).toBeNull()
  })

  it('always renders the unknown-future-spending disclaimer', async () => {
    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.disclaimer'))).toBeTruthy()
  })

  it('switches the forecast horizon and re-queries useCashFlowForecast with the new day count', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText(i18n.t('cashFlow.forecast.horizon.days90')))

    expect(mockUseCashFlowForecast).toHaveBeenLastCalledWith('household-1', 90)
  })

  it('defaults to the 30-day forecast horizon on first render', async () => {
    await render(<CashFlow />)

    expect(mockUseCashFlowForecast).toHaveBeenCalledWith('household-1', 30)
  })

  it('shows a loading state for the forecast section independent of the Safe-to-Spend section', async () => {
    mockUseCashFlowForecast.mockReturnValue({ ...defaultForecastResult(), isLoading: true })

    const { queryByText } = await render(<CashFlow />)

    // Safe-to-Spend's own breakdown still renders normally...
    expect(queryByText(i18n.t('cashFlow.availableCash'))).toBeTruthy()
    // ...while the forecast section's own data is not shown yet.
    expect(queryByText(i18n.t('cashFlow.forecast.availableCashToday'))).toBeNull()
  })

  it('shows an error message for the forecast section when its query fails', async () => {
    mockUseCashFlowForecast.mockReturnValue({ ...defaultForecastResult(), error: new Error('network down') })

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.errors.generic'))).toBeTruthy()
  })

  // Visual QA + Desktop Polish pass: the safe-to-spend and forecast columns
  // now match every other two-region desktop split in this app (Dashboard/
  // Budgets/Settings/Categories) — `web:desktop:flex-row-reverse` keeps
  // DOM/source order [safe-to-spend, forecast] while visually placing
  // safe-to-spend (primary) on the right, the correct RTL reading order —
  // see _layout.tsx's DesktopSideRail comment for why `-reverse` is needed
  // on web at all. Exact whitespace-token membership, not a `.toContain()`
  // substring check (which can't distinguish `flex-row` from
  // `flex-row-reverse`) — see this app's other desktop-split regression
  // tests for why that distinction matters.
  it('uses flex-row-reverse (not plain flex-row) so safe-to-spend reads on the right in RTL', async () => {
    const { getByText } = await render(<CashFlow />)

    function climbToPanel(textNode: any) {
      let current = textNode
      while (current && !((current.props?.className as string | undefined) ?? '').includes('web:desktop:rounded-card')) {
        current = current.parent
      }
      return current
    }

    const safeToSpendPanel = climbToPanel(getByText(i18n.t('cashFlow.availableCash')))
    const rowWrapper = safeToSpendPanel?.parent
    const tokens = ((rowWrapper?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:flex-row-reverse')
    expect(tokens).not.toContain('web:desktop:flex-row')

    const forecastPanel = climbToPanel(getByText(i18n.t('cashFlow.forecast.sectionTitle')))
    expect(forecastPanel?.parent).toBe(rowWrapper)
  })
})
