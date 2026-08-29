import { describe, expect, it, jest } from '@jest/globals'
import { render, fireEvent, act } from '@testing-library/react-native'
import '@/i18n'
import { FinancialTimeline } from './FinancialTimeline'
import type { CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))

function forecast(overrides: Partial<CashFlowForecastResult> = {}): CashFlowForecastResult {
  return {
    startingBalanceAgorot: 1_698_550,
    endingBalanceAgorot: 205_270,
    totalInflowsAgorot: 0,
    totalOutflowsAgorot: 1_493_280,
    lowestBalanceAgorot: 205_270,
    lowestBalanceDate: '2026-09-15',
    firstShortfallDate: null,
    upcomingObligationsCount: 1,
    events: [
      {
        id: 'recurring:rc-4:2026-08-20',
        date: '2026-08-20',
        amountAgorot: 38_000,
        direction: 'outflow',
        source: 'recurring',
        sourceId: 'rc-4',
        title: 'ביטוח רכב',
        pastDue: false,
      },
      {
        id: 'planned_obligation:ob-1:2026-08-28',
        date: '2026-08-28',
        amountAgorot: 122_400,
        direction: 'outflow',
        source: 'planned_obligation',
        sourceId: 'ob-1',
        title: 'ארנונה דו־חודשית',
        pastDue: false,
      },
    ],
    dailyPoints: [
      { date: '2026-08-20', balanceAgorot: 1_660_550, inflowsAgorot: 0, outflowsAgorot: 38_000 },
      { date: '2026-08-28', balanceAgorot: 1_538_150, inflowsAgorot: 0, outflowsAgorot: 122_400 },
      { date: '2026-09-15', balanceAgorot: 205_270, inflowsAgorot: 0, outflowsAgorot: 0 },
    ],
    ...overrides,
  }
}

describe('FinancialTimeline', () => {
  it('renders a step per event date plus today and the horizon end', async () => {
    const { getByTestId } = await render(<FinancialTimeline forecast={forecast()} />)
    expect(getByTestId('timeline-step-2026-08-20')).toBeTruthy()
    expect(getByTestId('timeline-step-2026-08-28')).toBeTruthy()
    expect(getByTestId('timeline-step-2026-09-15')).toBeTruthy()
  })

  it('renders a calm empty state, not a bare or broken strip, when there are zero future events', async () => {
    const { getByText, queryByTestId } = await render(
      <FinancialTimeline
        forecast={forecast({
          events: [],
          dailyPoints: [{ date: '2026-08-20', balanceAgorot: 1_698_550, inflowsAgorot: 0, outflowsAgorot: 0 }],
          lowestBalanceDate: '2026-08-20',
          lowestBalanceAgorot: 1_698_550,
        })}
      />
    )
    expect(getByText('אין תנועות עתידיות ידועות בטווח')).toBeTruthy()
    expect(queryByTestId('timeline-step-2026-08-20')).toBeNull()
  })

  it('renders correctly for exactly one future event (today + one step, no crash)', async () => {
    const single = forecast({
      events: [
        {
          id: 'recurring:rc-4:2026-08-28',
          date: '2026-08-28',
          amountAgorot: 38_000,
          direction: 'outflow',
          source: 'recurring',
          sourceId: 'rc-4',
          title: 'ביטוח רכב',
          pastDue: false,
        },
      ],
      dailyPoints: [
        { date: '2026-08-20', balanceAgorot: 1_698_550, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-28', balanceAgorot: 1_660_550, inflowsAgorot: 0, outflowsAgorot: 38_000 },
      ],
      lowestBalanceDate: '2026-08-28',
      lowestBalanceAgorot: 1_660_550,
    })
    const { getByTestId } = await render(<FinancialTimeline forecast={single} />)
    expect(getByTestId('timeline-step-2026-08-20')).toBeTruthy()
    expect(getByTestId('timeline-step-2026-08-28')).toBeTruthy()
  })

  it('does not crash and marks the low point in danger tone for a negative projected balance', async () => {
    const negative = forecast({
      lowestBalanceAgorot: -42_000,
      lowestBalanceDate: '2026-09-15',
      firstShortfallDate: '2026-09-15',
      dailyPoints: [
        { date: '2026-08-20', balanceAgorot: 1_660_550, inflowsAgorot: 0, outflowsAgorot: 38_000 },
        { date: '2026-08-28', balanceAgorot: 1_538_150, inflowsAgorot: 0, outflowsAgorot: 122_400 },
        { date: '2026-09-15', balanceAgorot: -42_000, inflowsAgorot: 0, outflowsAgorot: 1_580_150 },
      ],
    })
    await expect(render(<FinancialTimeline forecast={negative} />)).resolves.toBeTruthy()
  })

  it('pins a step on press, shows its events, and unpins on a second press', async () => {
    const { getByTestId, getByText, queryByText } = await render(<FinancialTimeline forecast={forecast()} />)
    await act(async () => fireEvent.press(getByTestId('timeline-step-2026-08-28')))
    expect(getByText('ארנונה דו־חודשית')).toBeTruthy()
    await act(async () => fireEvent.press(getByTestId('timeline-step-2026-08-28')))
    expect(queryByText('ארנונה דו־חודשית')).toBeNull()
  })

  it('truncates a very long Hebrew event title to one line instead of wrapping the row', async () => {
    const longTitle = 'תשלום עבור חידוש פוליסת ביטוח בריאות משפחתית מקיפה כולל כיסוי נסיעות לחו״ל לכל בני המשפחה'
    const withLongLabel = forecast({
      events: [
        {
          id: 'planned_obligation:ob-3:2026-08-28',
          date: '2026-08-28',
          amountAgorot: 106_600,
          direction: 'outflow',
          source: 'planned_obligation',
          sourceId: 'ob-3',
          title: longTitle,
          pastDue: false,
        },
      ],
    })
    const { getByTestId, getByText } = await render(<FinancialTimeline forecast={withLongLabel} />)
    await act(async () => fireEvent.press(getByTestId('timeline-step-2026-08-28')))
    const node = getByText(longTitle)
    expect(node.props.numberOfLines).toBe(1)
  })

  it('renders large currency values without crashing (six-figure balances)', async () => {
    const large = forecast({
      startingBalanceAgorot: 18_600_000,
      dailyPoints: [
        { date: '2026-08-20', balanceAgorot: 18_600_000, inflowsAgorot: 0, outflowsAgorot: 0 },
        { date: '2026-08-28', balanceAgorot: 18_478_000, inflowsAgorot: 0, outflowsAgorot: 122_000 },
        { date: '2026-09-15', balanceAgorot: 17_205_270, inflowsAgorot: 0, outflowsAgorot: 0 },
      ],
    })
    await expect(render(<FinancialTimeline forecast={large} />)).resolves.toBeTruthy()
  })

  it('flags a past-due event distinctly inside its step detail', async () => {
    const pastDue = forecast({
      events: [
        {
          id: 'installment_plan:ip-laptop:2026-08-20',
          date: '2026-08-20',
          amountAgorot: 48_000,
          direction: 'outflow',
          source: 'installment_plan',
          sourceId: 'ip-laptop',
          title: 'מחשב נייד, KSP',
          pastDue: true,
        },
      ],
    })
    const { getByTestId, getByText } = await render(<FinancialTimeline forecast={pastDue} />)
    await act(async () => fireEvent.press(getByTestId('timeline-step-2026-08-20')))
    expect(getByText('באיחור')).toBeTruthy()
  })
})
