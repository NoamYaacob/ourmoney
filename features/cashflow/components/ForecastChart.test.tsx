import { describe, expect, it, jest } from '@jest/globals'
import { render } from '@testing-library/react-native'
import { ForecastChart } from './ForecastChart'

jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))

function point(overrides: Partial<{ date: string; balanceAgorot: number; inflowsAgorot: number; outflowsAgorot: number }> = {}) {
  return { date: '2026-08-16', balanceAgorot: 500000, inflowsAgorot: 0, outflowsAgorot: 0, ...overrides }
}

describe('ForecastChart', () => {
  it('renders the SVG for a normal multi-day series', async () => {
    const dailyPoints = [
      point({ date: '2026-08-16', balanceAgorot: 500000 }),
      point({ date: '2026-08-17', balanceAgorot: 450000 }),
      point({ date: '2026-08-18', balanceAgorot: 470000 }),
    ]
    const { getByTestId } = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-17" chartSummary="summary" />
    )
    expect(getByTestId('forecast-chart', { includeHiddenElements: true })).toBeTruthy()
  })

  it('does not crash and renders nothing for an empty dailyPoints array', async () => {
    const { queryByTestId } = await render(
      <ForecastChart dailyPoints={[]} lowestBalanceDate="2026-08-16" chartSummary="summary" />
    )
    expect(queryByTestId('forecast-chart', { includeHiddenElements: true })).toBeNull()
  })

  it('does not crash for a single-day series (no division by zero)', async () => {
    const dailyPoints = [point({ date: '2026-08-16', balanceAgorot: 500000 })]
    await expect(
      render(<ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-16" chartSummary="summary" />)
    ).resolves.toBeTruthy()
  })

  it('does not crash when every daily point sits exactly at zero (zero range)', async () => {
    const dailyPoints = [point({ date: '2026-08-16', balanceAgorot: 0 }), point({ date: '2026-08-17', balanceAgorot: 0 })]
    await expect(
      render(<ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-16" chartSummary="summary" />)
    ).resolves.toBeTruthy()
  })

  it('exposes an accessible summary label instead of raw SVG content to screen readers', async () => {
    const dailyPoints = [point()]
    const { getByLabelText } = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-16" chartSummary="תקציר נגיש" />
    )
    expect(getByLabelText('תקציר נגיש')).toBeTruthy()
  })

  it('runs time right to left: today is at the start (right) edge, the horizon at the end', async () => {
    // SVG has no `dir`, so the RTL mirror has to be arithmetic. If this
    // regresses, the chart silently reads backwards for a Hebrew reader
    // while every surrounding style still looks correct.
    const dailyPoints = [
      point({ date: '2026-08-16', balanceAgorot: 500000 }),
      point({ date: '2026-08-17', balanceAgorot: 450000 }),
      point({ date: '2026-08-18', balanceAgorot: 470000 }),
    ]
    const { getByTestId } = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-17" chartSummary="summary" />
    )
    // react-native-svg compiles `points` down to a path `d` before it
    // reaches the host tree, so read the x of each "M x y x y ..." pair.
    const polyline = getByTestId('forecast-chart-line', { includeHiddenElements: true })
    const numbers = ((polyline.props.d as string) ?? '').replace('M', '').trim().split(/\s+/).map(Number)
    const xs = numbers.filter((_, i) => i % 2 === 0)

    // Today (index 0) is the largest x; the horizon's end is x=0.
    expect(xs[0]).toBeGreaterThan(xs[xs.length - 1]!)
    expect(xs[xs.length - 1]).toBe(0)
  })

  it('draws the design\u2019s low-point callout with the amount on it', async () => {
    const dailyPoints = [
      point({ date: '2026-08-16', balanceAgorot: 500000 }),
      point({ date: '2026-08-17', balanceAgorot: -61200 }),
      point({ date: '2026-08-18', balanceAgorot: 470000 }),
    ]
    const { getByTestId } = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-17" chartSummary="summary" />
    )
    const callout = getByTestId('forecast-chart-callout', { includeHiddenElements: true })
    expect(callout).toBeTruthy()
  })

  it('hides the zero reference line/label when the balance stays comfortably clear of zero', async () => {
    // Real day-to-day movement (~17,000 ₪) against a balance that never
    // comes anywhere near zero (min 83,226.95, range well under the
    // balance itself) — the exact "almost completely flat" product-quality
    // finding this fixed. The axis compresses to the data's own range
    // instead of stretching down to an irrelevant zero.
    const dailyPoints = [
      point({ date: '2026-08-26', balanceAgorot: 10_061_875 }),
      point({ date: '2026-09-05', balanceAgorot: 8_600_000 }),
      point({ date: '2026-09-20', balanceAgorot: 8_322_695 }),
    ]
    const { queryByText } = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-09-20" chartSummary="summary" variant="wide" />
    )
    expect(queryByText('0 ₪', { includeHiddenElements: true })).toBeNull()
  })

  it('keeps the zero reference line/label when the balance genuinely comes close to zero, even though it stays positive', async () => {
    // Positive throughout, but the balance's own range (500 -> -old min 100,
    // i.e. a 400 span) is NOT small relative to how close it sits to zero —
    // this household's forecast is exactly the safety-relevant case the
    // zero rule exists for, so it must not be compressed away.
    const dailyPoints = [
      point({ date: '2026-08-26', balanceAgorot: 50000 }),
      point({ date: '2026-09-05', balanceAgorot: 10000 }),
      point({ date: '2026-09-20', balanceAgorot: 30000 }),
    ]
    const { getByText } = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-09-05" chartSummary="summary" variant="wide" />
    )
    expect(getByText('0 ₪', { includeHiddenElements: true })).toBeTruthy()
  })

  it('labels four points on the wide (desktop) variant and three on the compact one', async () => {
    const dailyPoints = Array.from({ length: 30 }, (_, i) =>
      point({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, balanceAgorot: 100000 + i })
    )

    const compact = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-01" chartSummary="s" />
    )
    expect(compact.getAllByText(/^\d{2}\.\d{2}$/, { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(3)

    const wide = await render(
      <ForecastChart dailyPoints={dailyPoints} lowestBalanceDate="2026-08-01" chartSummary="s" variant="wide" />
    )
    expect(wide.getAllByText(/^\d{2}\.\d{2}$/, { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(4)
  })
})
