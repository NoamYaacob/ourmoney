// Route-level smoke tests for the CP8B Money Journey review harness — real
// hooks mocked at the same seam every other screen's own tests mock them
// at, proving the route wires real production data into the real
// MoneyJourney component rather than a detached fixture.

import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import i18n from '@/i18n'
import MoneyJourneyReview from './index'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
}))
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))
jest.mock('@/features/household/hooks/useHousehold', () => ({
  useHousehold: () => ({ householdId: 'household-1', isLoading: false }),
}))

const BASE_FORECAST = {
  startingBalanceAgorot: 500_000,
  endingBalanceAgorot: 450_000,
  totalInflowsAgorot: 0,
  totalOutflowsAgorot: 50_000,
  lowestBalanceAgorot: 450_000,
  lowestBalanceDate: '2026-08-28',
  firstShortfallDate: null,
  upcomingObligationsCount: 1,
  events: [
    {
      id: 'planned_obligation:o1:2026-08-28',
      date: '2026-08-28',
      amountAgorot: 50_000,
      direction: 'outflow' as const,
      source: 'planned_obligation' as const,
      sourceId: 'o1',
      title: 'ארנונה דו־חודשית',
      pastDue: false,
    },
  ],
  dailyPoints: [
    { date: '2026-08-18', balanceAgorot: 500_000, inflowsAgorot: 0, outflowsAgorot: 0 },
    { date: '2026-08-28', balanceAgorot: 450_000, inflowsAgorot: 0, outflowsAgorot: 50_000 },
  ],
}
let mockForecastResult: typeof BASE_FORECAST = BASE_FORECAST
let mockForecastHasData = true
jest.mock('@/features/cashflow/hooks/useCashFlowForecast', () => ({
  useCashFlowForecast: () => ({
    result: mockForecastResult,
    isLoading: false,
    error: null,
    hasData: mockForecastHasData,
    refetch: jest.fn(),
  }),
}))

jest.mock('@/features/cashflow/hooks/useSafeToSpend', () => ({
  useSafeToSpend: () => ({
    result: { safeToSpendAgorot: 450_000 },
    isLoading: false,
    error: null,
    hasData: true,
    refetch: jest.fn(),
  }),
}))

beforeEach(() => {
  mockBack.mockClear()
  mockForecastResult = BASE_FORECAST
  mockForecastHasData = true
})

describe('Money Journey review route', () => {
  it('renders the real screen title and a real forecast event', async () => {
    const { getByText } = await render(<MoneyJourneyReview />)
    expect(getByText(i18n.t('moneyJourney.title'))).toBeTruthy()
    expect(getByText(/ארנונה דו־חודשית/)).toBeTruthy()
  })

  it('shows a blocking error only when the forecast has never loaded', async () => {
    mockForecastHasData = false
    const { getByText } = await render(<MoneyJourneyReview />)
    expect(getByText(i18n.t('cashFlow.errors.generic'))).toBeTruthy()
  })

  it('shows the empty state for a household with no forecast events', async () => {
    mockForecastResult = { ...BASE_FORECAST, events: [], dailyPoints: [BASE_FORECAST.dailyPoints[0]!] }
    const { getByText } = await render(<MoneyJourneyReview />)
    expect(getByText(i18n.t('home.timeline.empty'))).toBeTruthy()
  })
})
