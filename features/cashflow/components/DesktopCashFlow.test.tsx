// Desktop Claude Design pass. Rebuilt to mirror MobileCashFlow's own
// "answer first, then evidence" composition (Screen 06 of the mobile
// design) instead of the pre-redesign screen's separate Safe-to-Spend/
// commitments sections — see DesktopCashFlow.tsx's own header comment for
// why those were dropped, not restyled. Test structure mirrors
// MobileCashFlow.test.tsx's own coverage, plus desktop-specific behavior
// (horizon switching, navigation, RTL).
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import { DesktopCashFlow as CashFlow } from './DesktopCashFlow'

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

function forecastEvent(overrides: Record<string, unknown>) {
  return {
    id: 'e1',
    date: '2026-09-04',
    amountAgorot: 118_000,
    direction: 'outflow',
    source: 'planned_obligation',
    sourceId: 'o1',
    title: 'טסט ואגרת רכב',
    pastDue: false,
    ...overrides,
  }
}

const HEALTHY = {
  startingBalanceAgorot: 1_310_000,
  endingBalanceAgorot: 682_400,
  totalInflowsAgorot: 1_395_000,
  totalOutflowsAgorot: 2_022_600,
  lowestBalanceAgorot: 210_000,
  lowestBalanceDate: '2026-09-04',
  firstShortfallDate: null as string | null,
  upcomingObligationsCount: 2,
  events: [forecastEvent({})],
  dailyPoints: [
    { date: '2026-08-22', balanceAgorot: 1_310_000, inflowsAgorot: 0, outflowsAgorot: 0 },
    { date: '2026-09-04', balanceAgorot: 210_000, inflowsAgorot: 0, outflowsAgorot: 118_000 },
    { date: '2026-09-21', balanceAgorot: 682_400, inflowsAgorot: 0, outflowsAgorot: 0 },
  ],
}
const mockUseCashFlowForecast = jest.fn()
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: (...args: unknown[]) => mockUseCashFlowForecast(...args),
}))

beforeEach(() => {
  mockPush.mockClear()
  mockUseCashFlowForecast.mockReset()
  mockUseCashFlowForecast.mockReturnValue({ result: { ...HEALTHY }, isLoading: false, error: null })
})

describe('DesktopCashFlow', () => {
  it('leads with a reassuring sentence when nothing goes negative', async () => {
    const { getByText } = await render(<CashFlow />)

    expect(
      getByText(i18n.t('cashFlow.mobile.answerOk', { amount: formatILS(HEALTHY.lowestBalanceAgorot), date: '04.09.2026' }))
    ).toBeTruthy()
  })

  it('leads with the shortfall date and magnitude when the balance goes under', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, lowestBalanceAgorot: -61_200, firstShortfallDate: '2026-09-04' },
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.mobile.answerShortfall', { date: '04.09.2026', amount: formatILS(61_200) }))).toBeTruthy()
  })

  it('tags the event that takes the balance to its low point, and shows the shortfall warning card', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, lowestBalanceAgorot: -61_200, firstShortfallDate: '2026-09-04' },
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<CashFlow />)

    expect(getByText('טסט ואגרת רכב')).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.causeTag'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.forecast.shortfallWarningTitle'))).toBeTruthy()
  })

  it('does not tag an income event as the cause, and shows the no-shortfall state', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, events: [forecastEvent({ id: 'salary', direction: 'inflow', title: 'משכורת דנה', amountAgorot: 1_395_000 })] },
      isLoading: false,
      error: null,
    })

    const { getByText, queryByText } = await render(<CashFlow />)

    expect(queryByText(i18n.t('cashFlow.mobile.causeTag'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.mobile.causeTagLow'))).toBeNull()
    expect(getByText(i18n.t('cashFlow.forecast.noShortfall'))).toBeTruthy()
    expect(queryByText(i18n.t('cashFlow.forecast.shortfallWarningTitle'))).toBeNull()
  })

  it('shows the three balance figures the screen is built around, and the chart', async () => {
    const { getByText, getAllByText, getByTestId } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.mobile.today'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.lowPoint'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.atEnd'))).toBeTruthy()
    // The chart's own accessibility summary text repeats the same figures —
    // at least one match (the stat row's own Money figure) is what's checked.
    expect(getAllByText(formatILS(HEALTHY.startingBalanceAgorot)).length).toBeGreaterThanOrEqual(1)
    expect(getAllByText(formatILS(HEALTHY.endingBalanceAgorot)).length).toBeGreaterThanOrEqual(1)
    expect(getByTestId('cash-flow-forecast-chart-svg', { includeHiddenElements: true })).toBeTruthy()
  })

  it('keeps the forecast disclaimer — the projection is not a promise', async () => {
    const { getByText } = await render(<CashFlow />)
    expect(getByText(i18n.t('cashFlow.forecast.disclaimer'))).toBeTruthy()
  })

  it('shows the empty-events state when there are no forecast events', async () => {
    mockUseCashFlowForecast.mockReturnValue({ result: { ...HEALTHY, events: [] }, isLoading: false, error: null })

    const { getByText, queryByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.mobile.eventsEmpty'))).toBeTruthy()
    expect(queryByText('טסט ואגרת רכב')).toBeNull()
  })

  it('navigates to the obligation detail screen when a planned_obligation event is tapped', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText('טסט ואגרת רכב'))

    expect(mockPush).toHaveBeenCalledWith('/obligations/o1')
  })

  it('navigates to the recurring detail screen when a recurring event is tapped', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, events: [forecastEvent({ id: 'e2', source: 'recurring', sourceId: 'rec-1', title: 'חשמל' })] },
      isLoading: false,
      error: null,
    })

    const { getByText } = await render(<CashFlow />)
    await fireEvent.press(getByText('חשמל'))

    expect(mockPush).toHaveBeenCalledWith('/recurring/rec-1')
  })

  it('switches the horizon and re-queries useCashFlowForecast with the new day count', async () => {
    const { getByText } = await render(<CashFlow />)

    await fireEvent.press(getByText(i18n.t('cashFlow.forecast.horizon.days90')))

    expect(mockUseCashFlowForecast).toHaveBeenLastCalledWith('household-1', 90)
  })

  it('defaults to the 30-day horizon on first render', async () => {
    await render(<CashFlow />)

    expect(mockUseCashFlowForecast).toHaveBeenCalledWith('household-1', 30)
  })

  it('shows an error message when the query fails', async () => {
    mockUseCashFlowForecast.mockReturnValue({ result: HEALTHY, isLoading: false, error: new Error('network down') })

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.errors.generic'))).toBeTruthy()
  })

  it('shows a loading state instead of the headline while the query is pending', async () => {
    mockUseCashFlowForecast.mockReturnValue({ result: HEALTHY, isLoading: true, error: null })

    const { queryByText } = await render(<CashFlow />)

    expect(queryByText(i18n.t('cashFlow.mobile.today'))).toBeNull()
  })

  // Visual QA + Desktop Polish pass convention: `web:desktop:flex-row-
  // reverse` (not plain `flex-row`) is what keeps a primary-content-first
  // DOM order reading right-to-left on web — see this app's other desktop
  // screens' identical regression tests for why the exact-token check
  // matters (a `.toContain()` substring check can't tell `flex-row` and
  // `flex-row-reverse` apart).
  it('uses flex-row-reverse (not plain flex-row) for the header row, so the title reads on the right', async () => {
    const { getByText } = await render(<CashFlow />)

    const header = getByText(i18n.t('tabs.cashFlow')).parent
    const tokens = ((header?.props.className as string | undefined) ?? '').split(/\s+/)
    expect(tokens).toContain('web:desktop:flex-row-reverse')
    expect(tokens).not.toContain('web:desktop:flex-row')
  })
})
