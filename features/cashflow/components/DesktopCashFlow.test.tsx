// Desktop Claude Design pass. Rebuilt to mirror MobileCashFlow's own
// "answer first, then evidence" composition (Screen 06 of the mobile
// design) instead of the pre-redesign screen's separate Safe-to-Spend/
// commitments sections — see DesktopCashFlow.tsx's own header comment for
// why those were dropped, not restyled. Test structure mirrors
// MobileCashFlow.test.tsx's own coverage, plus desktop-specific behavior
// (horizon switching, navigation, RTL).
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { useCashFlowStore } from '@/store/cashFlowStore'
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
  // The horizon is module-level store state now, so a test that changes it
  // would otherwise leak into the next one.
  useCashFlowStore.setState({ horizonDays: '30' })
  mockUseCashFlowForecast.mockReset()
  mockUseCashFlowForecast.mockReturnValue({ result: { ...HEALTHY }, isLoading: false, error: null, hasData: true })
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
      error: null, hasData: true,})

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.mobile.answerShortfall', { date: '04.09.2026', amount: formatILS(61_200) }))).toBeTruthy()
  })

  it('tags the event that takes the balance to its low point', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, lowestBalanceAgorot: -61_200, firstShortfallDate: '2026-09-04' },
      isLoading: false,
      error: null, hasData: true,})

    const { getByText } = await render(<CashFlow />)

    expect(getByText('טסט ואגרת רכב')).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.causeTag'))).toBeTruthy()
  })

  // Checkpoint 5: the trailing shortfall-status card (shortfallWarningTitle
  // in the shortfall case, noShortfall in the calm one) was pure duplicate
  // messaging — cashFlow.mobile.answerShortfall/answerOk above it already
  // states the same date and amount. Removed as a "summary card + chart
  // card + status card" pattern, not a feature cut — these regression
  // guards now assert the duplicate text is GONE, not present.
  it('does not tag an income event as the cause, and shows no separate shortfall-status card (the answer sentence already carries that)', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, events: [forecastEvent({ id: 'salary', direction: 'inflow', title: 'משכורת דנה', amountAgorot: 1_395_000 })] },
      isLoading: false,
      error: null, hasData: true,})

    const { queryByText } = await render(<CashFlow />)

    expect(queryByText(i18n.t('cashFlow.mobile.causeTag'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.mobile.causeTagLow'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.forecast.noShortfall'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.forecast.shortfallWarningTitle'))).toBeNull()
  })

  it('never renders the removed duplicate shortfall-status card, even in the shortfall case', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY, lowestBalanceAgorot: -61_200, firstShortfallDate: '2026-09-04' },
      isLoading: false,
      error: null, hasData: true,})

    const { queryByText } = await render(<CashFlow />)

    expect(queryByText(i18n.t('cashFlow.forecast.shortfallWarningTitle'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.forecast.shortfallWarningBody', { date: '2026-09-04' }))).toBeNull()
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
    expect(getByTestId('forecast-chart', { includeHiddenElements: true })).toBeTruthy()
  })

  it('keeps the forecast disclaimer — the projection is not a promise', async () => {
    const { getByText } = await render(<CashFlow />)
    expect(getByText(i18n.t('cashFlow.forecast.disclaimer'))).toBeTruthy()
  })

  // Regression coverage for the real-preview bug: Cash Flow rendering
  // "almost totally blank, then just an error message" after a previously
  // successful load. Root cause was useCashFlowForecast.error (a union
  // across six underlying queries) blanking the whole screen on ANY
  // background refetch failure, even though `result` still held real,
  // last-known-good data. The fix keys the screen's branching on `hasData`
  // (true once loaded, stays true through a later failed background
  // refetch) instead of `error`.
  it('keeps showing the last-known-good forecast — with a non-blocking banner, not a full-screen replacement — when a background refetch fails after a previous success', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY },
      isLoading: false,
      error: new Error('background refetch failed'),
      hasData: true,
      refetch: jest.fn(),
    })

    const { getByText, getAllByText } = await render(<CashFlow />)

    expect(
      getByText(i18n.t('cashFlow.mobile.answerOk', { amount: formatILS(HEALTHY.lowestBalanceAgorot), date: '04.09.2026' }))
    ).toBeTruthy()
    expect(getAllByText(formatILS(HEALTHY.startingBalanceAgorot)).length).toBeGreaterThanOrEqual(1)
    expect(getByText(i18n.t('cashFlow.forecast.disclaimer'))).toBeTruthy()
    expect(getAllByText(i18n.t('cashFlow.forecast.errors.generic')).length).toBeGreaterThan(0)
  })

  it('shows the full blocking error state (no forecast content to preserve) only when nothing has ever loaded', async () => {
    mockUseCashFlowForecast.mockReturnValue({
      result: { ...HEALTHY },
      isLoading: false,
      error: new Error('first load failed'),
      hasData: false,
      refetch: jest.fn(),
    })

    const { getByText, queryByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.errors.generic'))).toBeTruthy()
    expect(queryByText(i18n.t('cashFlow.mobile.today'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.forecast.disclaimer'))).toBeNull()
  })

  it('shows the empty-events state when there are no forecast events', async () => {
    mockUseCashFlowForecast.mockReturnValue({ result: { ...HEALTHY, events: [] }, isLoading: false, error: null, hasData: true })

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
      error: null, hasData: true,})

    const { getByText } = await render(<CashFlow />)
    await fireEvent.press(getByText('חשמל'))

    expect(mockPush).toHaveBeenCalledWith('/recurring/rec-1')
  })

  it('re-queries useCashFlowForecast when the shell header changes the horizon', async () => {
    // The 30/60/90 selector lives in DesktopTopBar now — the mockup draws it
    // in the header band, not the screen body — so the screen reads the
    // horizon from the store the bar writes. Setting the store directly is
    // exactly what pressing that control does.
    await render(<CashFlow />)

    await act(async () => {
      useCashFlowStore.getState().setHorizonDays('90')
    })

    expect(mockUseCashFlowForecast).toHaveBeenLastCalledWith('household-1', 90)
  })

  it('draws no title and no horizon selector of its own', async () => {
    // Both belong to the shell band. Rendering them here titled the desktop
    // page twice, which is what this guards against coming back.
    const { queryByText } = await render(<CashFlow />)

    expect(queryByText(i18n.t('nav.cashFlow'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.forecast.horizon.days90'))).toBeNull()
  })

  it('defaults to the 30-day horizon on first render', async () => {
    await render(<CashFlow />)

    expect(mockUseCashFlowForecast).toHaveBeenCalledWith('household-1', 30)
  })

  it('shows an error message when the query fails', async () => {
    // Never loaded — no prior successful data.
    mockUseCashFlowForecast.mockReturnValue({ result: HEALTHY, isLoading: false, error: new Error('network down'), hasData: false })

    const { getByText } = await render(<CashFlow />)

    expect(getByText(i18n.t('cashFlow.forecast.errors.generic'))).toBeTruthy()
  })

  it('shows a loading state instead of the headline while the query is pending', async () => {
    mockUseCashFlowForecast.mockReturnValue({ result: HEALTHY, isLoading: true, error: null, hasData: true })

    const { queryByText } = await render(<CashFlow />)

    expect(queryByText(i18n.t('cashFlow.mobile.today'))).toBeNull()
  })

})
