import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { CashFlowForecastChart } from './CashFlowForecastChart'

jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))

function point(overrides: Partial<{ date: string; balanceAgorot: number; inflowsAgorot: number; outflowsAgorot: number }> = {}) {
  return { date: '2026-08-16', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0, ...overrides }
}

describe('CashFlowForecastChart', () => {
  it('renders the SVG for a normal multi-day series', async () => {
    const dailyPoints = [
      point({ date: '2026-08-16', balanceAgorot: 500000 }),
      point({ date: '2026-08-17', balanceAgorot: 450000 }),
      point({ date: '2026-08-18', balanceAgorot: 470000 }),
    ]
    const { getByTestId } = await render(
      <CashFlowForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-17" chartSummary="summary" />
    )
    expect(getByTestId('cash-flow-forecast-chart-svg', { includeHiddenElements: true })).toBeTruthy()
  })

  it('does not crash and renders nothing for an empty dailyPoints array', async () => {
    const { queryByTestId } = await render(
      <CashFlowForecastChart dailyPoints={[]} lowestBalanceDate="2026-08-16" chartSummary="summary" />
    )
    expect(queryByTestId('cash-flow-forecast-chart-svg', { includeHiddenElements: true })).toBeNull()
  })

  it('does not crash for a single-day series (no division by zero)', async () => {
    const dailyPoints = [point({ date: '2026-08-16', balanceAgorot: 500000 })]
    await expect(
      render(<CashFlowForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-16" chartSummary="summary" />)
    ).resolves.toBeTruthy()
  })

  it('does not crash when every daily point sits exactly at zero (zero range)', async () => {
    const dailyPoints = [point({ date: '2026-08-16', balanceAgorot: 0 }), point({ date: '2026-08-17', balanceAgorot: 0 })]
    await expect(
      render(<CashFlowForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-16" chartSummary="summary" />)
    ).resolves.toBeTruthy()
  })

  it('exposes an accessible summary label instead of raw SVG content to screen readers', async () => {
    const dailyPoints = [point()]
    const { getByLabelText } = await render(
      <CashFlowForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-16" chartSummary="תקציר נגיש" />
    )
    expect(getByLabelText('תקציר נגיש')).toBeTruthy()
  })
})
