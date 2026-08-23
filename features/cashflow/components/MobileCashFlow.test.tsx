// The mobile cash-flow screen's claim is that it answers "will the money
// last?" before it shows any evidence, and that it names the event
// responsible for the low point. These tests hold it to both.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import { MobileCashFlow } from './MobileCashFlow'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
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
let mockForecast = { ...HEALTHY }
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: () => ({ result: mockForecast, isLoading: false, error: null }),
}))

beforeEach(() => {
  mockForecast = { ...HEALTHY }
})

describe('MobileCashFlow', () => {
  it('leads with a reassuring sentence when nothing goes negative', async () => {
    const { getByText } = await render(<MobileCashFlow />)

    expect(
      getByText(
        i18n.t('cashFlow.mobile.answerOk', {
          amount: formatILS(HEALTHY.lowestBalanceAgorot),
          date: '04.09.2026',
        })
      )
    ).toBeTruthy()
  })

  it('leads with the shortfall date and magnitude when the balance goes under', async () => {
    mockForecast = {
      ...HEALTHY,
      lowestBalanceAgorot: -61_200,
      firstShortfallDate: '2026-09-04',
    }
    const { getByText } = await render(<MobileCashFlow />)

    expect(
      getByText(i18n.t('cashFlow.mobile.answerShortfall', { date: '04.09.2026', amount: formatILS(61_200) }))
    ).toBeTruthy()
  })

  it('tags the event that takes the balance to its low point', async () => {
    mockForecast = { ...HEALTHY, lowestBalanceAgorot: -61_200, firstShortfallDate: '2026-09-04' }
    const { getByText } = await render(<MobileCashFlow />)

    expect(getByText('טסט ואגרת רכב')).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.causeTag'))).toBeTruthy()
  })

  it('does not tag an income event as the cause', async () => {
    mockForecast = {
      ...HEALTHY,
      events: [forecastEvent({ id: 'salary', direction: 'inflow', title: 'משכורת דנה', amountAgorot: 1_395_000 })],
    }
    const { queryByText } = await render(<MobileCashFlow />)

    expect(queryByText(i18n.t('cashFlow.mobile.causeTag'))).toBeNull()
    expect(queryByText(i18n.t('cashFlow.mobile.causeTagLow'))).toBeNull()
  })

  it('shows the three balance figures the screen is built around', async () => {
    const { getByText } = await render(<MobileCashFlow />)

    expect(getByText(i18n.t('cashFlow.mobile.today'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.lowPoint'))).toBeTruthy()
    expect(getByText(i18n.t('cashFlow.mobile.atEnd'))).toBeTruthy()
    expect(getByText(formatILS(HEALTHY.startingBalanceAgorot))).toBeTruthy()
    expect(getByText(formatILS(HEALTHY.endingBalanceAgorot))).toBeTruthy()
  })

  it('keeps the forecast disclaimer — the projection is not a promise', async () => {
    const { getByText } = await render(<MobileCashFlow />)
    expect(getByText(i18n.t('cashFlow.forecast.disclaimer'))).toBeTruthy()
  })
})
