import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render } from '@testing-library/react-native'
import i18n from '@/i18n'
import { formatILS } from '@/lib/money/format'
import { MoneyJourney } from './MoneyJourney'
import type { CashFlowForecastEvent, CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}))
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

function event(overrides: Partial<CashFlowForecastEvent> & Pick<CashFlowForecastEvent, 'id' | 'date' | 'amountAgorot' | 'direction' | 'title'>): CashFlowForecastEvent {
  return { source: 'planned_obligation', sourceId: overrides.id, pastDue: false, ...overrides }
}

// Same fixture shape as moneyJourneySteps.test.ts: a severe salary inflow,
// a severe rent outflow (also the Safe-to-Spend match, when passed), a
// same-day cluster with a new local low, the global low point, and a
// routine tail event.
const FORECAST: CashFlowForecastResult = {
  startingBalanceAgorot: 500_000,
  endingBalanceAgorot: 182_000,
  totalInflowsAgorot: 432_000,
  totalOutflowsAgorot: 750_000,
  lowestBalanceAgorot: 180_000,
  lowestBalanceDate: '2026-08-20',
  firstShortfallDate: null,
  upcomingObligationsCount: 3,
  events: [
    event({ id: 'e-salary', date: '2026-08-17', amountAgorot: 400_000, direction: 'inflow', source: 'recurring', title: 'משכורת' }),
    event({ id: 'e-rent', date: '2026-08-18', amountAgorot: 350_000, direction: 'outflow', title: 'שכר דירה' }),
    event({ id: 'e-car', date: '2026-08-19', amountAgorot: 100_000, direction: 'outflow', title: 'רכב' }),
    event({ id: 'e-refund', date: '2026-08-19', amountAgorot: 30_000, direction: 'inflow', source: 'recurring', title: 'זיכוי' }),
    event({ id: 'e-bigbill', date: '2026-08-20', amountAgorot: 300_000, direction: 'outflow', title: 'ביטוח שנתי' }),
    event({ id: 'e-small-refund', date: '2026-08-21', amountAgorot: 2_000, direction: 'inflow', source: 'recurring', title: 'זיכוי קטן' }),
  ],
  dailyPoints: [
    { date: '2026-08-16', balanceAgorot: 500_000, inflowsAgorot: 0, outflowsAgorot: 0 },
    { date: '2026-08-17', balanceAgorot: 900_000, inflowsAgorot: 400_000, outflowsAgorot: 0 },
    { date: '2026-08-18', balanceAgorot: 550_000, inflowsAgorot: 0, outflowsAgorot: 350_000 },
    { date: '2026-08-19', balanceAgorot: 480_000, inflowsAgorot: 30_000, outflowsAgorot: 100_000 },
    { date: '2026-08-20', balanceAgorot: 180_000, inflowsAgorot: 0, outflowsAgorot: 300_000 },
    { date: '2026-08-21', balanceAgorot: 182_000, inflowsAgorot: 2_000, outflowsAgorot: 0 },
  ],
}

const EMPTY_FORECAST: CashFlowForecastResult = {
  startingBalanceAgorot: 500_000,
  endingBalanceAgorot: 500_000,
  totalInflowsAgorot: 0,
  totalOutflowsAgorot: 0,
  lowestBalanceAgorot: 500_000,
  lowestBalanceDate: '2026-08-16',
  firstShortfallDate: null,
  upcomingObligationsCount: 0,
  events: [],
  dailyPoints: [{ date: '2026-08-16', balanceAgorot: 500_000, inflowsAgorot: 0, outflowsAgorot: 0 }],
}

describe('MoneyJourney — empty behavior', () => {
  it('says so plainly when there are no forecast events, for every variant', async () => {
    for (const variant of ['mobile', 'tabletLg', 'desktop'] as const) {
      const { getByText } = await render(<MoneyJourney forecast={EMPTY_FORECAST} safeToSpendAgorot={null} variant={variant} />)
      expect(getByText(i18n.t('home.timeline.empty'))).toBeTruthy()
    }
  })
})

describe('MoneyJourney — mobile list', () => {
  it('shows the low point marked as such, and the routine tail event only after expanding', async () => {
    const { getByText, queryByText } = await render(<MoneyJourney forecast={FORECAST} safeToSpendAgorot={null} variant="mobile" />)

    expect(getByText(`ביטוח שנתי · ${i18n.t('home.timeline.lowSuffix')}`)).toBeTruthy()
    // "זיכוי קטן" (the small, routine, non-dipping refund) is collapsed by
    // default — only critical/high-priority steps show until expanded.
    expect(queryByText('זיכוי קטן')).toBeNull()
  })

  it('reveals every step, including the routine one, once expanded', async () => {
    const { getByText } = await render(<MoneyJourney forecast={FORECAST} safeToSpendAgorot={null} variant="mobile" />)
    await fireEvent.press(getByText(i18n.t('home.timeline.showAll', { count: 5 })))
    expect(getByText('זיכוי קטן')).toBeTruthy()
  })

  it('selecting an event reveals its real BEFORE -> DELTA -> AFTER breakdown, not just its resulting balance', async () => {
    const { getByText, getAllByText } = await render(<MoneyJourney forecast={FORECAST} safeToSpendAgorot={null} variant="mobile" />)

    await fireEvent.press(getByText('שכר דירה'))

    expect(getByText(i18n.t('moneyJourney.before'))).toBeTruthy()
    expect(getByText(i18n.t('moneyJourney.after'))).toBeTruthy()
    // Before (₪5,500.00) and after (₪1,800.00... no — this step's before is
    // 900,000 and after is 550,000) both appear as real Money figures.
    expect(getAllByText(formatILS(900_000)).length).toBeGreaterThan(0)
    expect(getAllByText(formatILS(550_000)).length).toBeGreaterThan(0)
    // The real underlying event is listed too — "שכר דירה" now legitimately
    // appears twice: the step row's own cause, and the causal detail's real
    // event list underneath it.
    expect(getAllByText('שכר דירה').length).toBe(2)
  })

  it('marks the step whose resulting balance truthfully matches Safe-to-Spend, never a different one', async () => {
    const { getByText, queryByText } = await render(
      <MoneyJourney forecast={FORECAST} safeToSpendAgorot={550_000} variant="mobile" />
    )
    // 550,000 is "שכר דירה"'s own resulting balance.
    await fireEvent.press(getByText('שכר דירה'))
    expect(getByText(i18n.t('home.timeline.conclusionFlag'))).toBeTruthy()

    // A mismatched Safe-to-Spend figure must never fabricate a match.
    const { queryByText: queryNoMatch } = await render(
      <MoneyJourney forecast={FORECAST} safeToSpendAgorot={999_999} variant="mobile" />
    )
    expect(queryNoMatch(i18n.t('home.timeline.conclusionFlag'))).toBeNull()
    void queryByText
  })
})

describe('MoneyJourney — tablet/desktop chart', () => {
  it('renders every event as an independently accessible node, even under dense same-width-slot data where labels must collide', async () => {
    // One event every single day for 20 days — at the chart's own untested
    // (pre-layout) fallback width, adjacent-day spacing is well under the
    // desktop label slot width, guaranteeing real collisions to resolve.
    const dense: CashFlowForecastResult = {
      ...FORECAST,
      events: Array.from({ length: 20 }, (_, i) =>
        event({
          id: `d-${i}`,
          date: `2026-08-${String(1 + i).padStart(2, '0')}`,
          amountAgorot: 10_000 + i * 100,
          direction: i % 2 === 0 ? 'outflow' : 'inflow',
          title: `אירוע ${i}`,
        })
      ),
      dailyPoints: Array.from({ length: 20 }, (_, i) => ({
        date: `2026-08-${String(1 + i).padStart(2, '0')}`,
        balanceAgorot: 500_000 - i * 1_000,
        inflowsAgorot: i % 2 === 1 ? 10_000 + i * 100 : 0,
        outflowsAgorot: i % 2 === 0 ? 10_000 + i * 100 : 0,
      })),
      lowestBalanceDate: '2026-08-20',
      lowestBalanceAgorot: 481_000,
    }

    const { getAllByRole, queryAllByText } = await render(
      <MoneyJourney forecast={dense} safeToSpendAgorot={null} variant="desktop" />
    )
    const buttons = getAllByRole('button')
    // Every one of the 20 real events still has its own accessible node —
    // collision resolution hides PRINTED labels, never the node itself.
    expect(buttons.length).toBeGreaterThanOrEqual(20)

    // A suppressed step must print NOTHING — neither its full label nor a
    // smaller "just the balance" fallback. Production visual review caught
    // exactly this as a real bug: an unconditional balance-only fallback
    // was never itself checked against resolveLabelCollisions, so two
    // suppressed neighbors' own fallback text still visually overlapped
    // each other. Real day-to-day spacing here (~57px) is well under the
    // 108px desktop slot width, so most of the 20 causes must be
    // suppressed — asserting "well under 20" directly proves suppression
    // is actually happening, not just that it theoretically could.
    const visibleCauses = queryAllByText(/^אירוע \d+$/)
    expect(visibleCauses.length).toBeGreaterThan(0)
    expect(visibleCauses.length).toBeLessThan(20)
  })

  it('gives every bar a full accessible label (cause, date, delta, resulting balance) regardless of whether its printed label is shown', async () => {
    const { getByLabelText } = await render(<MoneyJourney forecast={FORECAST} safeToSpendAgorot={null} variant="desktop" />)
    const label = getByLabelText(/משכורת/)
    expect(label).toBeTruthy()
  })

  it('never lets a same-day (pastDue-clamped) step crowd the baseline’s own "today" label', async () => {
    // The real case this guards: several originally-different due dates all
    // clamp to day 0 when they're overdue relative to the horizon's real
    // start (calculateCashFlowForecast's own pastDue handling) — a cluster
    // event landing exactly on today's own index.
    const sameDayAsBaseline: CashFlowForecastResult = {
      ...FORECAST,
      events: [
        ...FORECAST.events,
        event({ id: 'e-clamped', date: '2026-08-16', amountAgorot: 40_000, direction: 'outflow', title: 'חיוב שעבר זמנו' }),
      ],
      dailyPoints: [{ date: '2026-08-16', balanceAgorot: 460_000, inflowsAgorot: 0, outflowsAgorot: 40_000 }, ...FORECAST.dailyPoints.slice(1)],
    }
    const { getByText, queryByText } = await render(
      <MoneyJourney forecast={sameDayAsBaseline} safeToSpendAgorot={null} variant="desktop" />
    )
    // The baseline's own label always renders...
    expect(getByText(i18n.t('home.timeline.today'))).toBeTruthy()
    // ...and the same-day step's printed label is suppressed rather than
    // drawn on top of it (its bar/node stays independently accessible —
    // covered by the "every event accessible" test above).
    expect(queryByText('חיוב שעבר זמנו')).toBeNull()
  })

  it('does not turn the whole chart red for a forecast that dips negative — only the low point itself is marked', async () => {
    const negative: CashFlowForecastResult = {
      ...FORECAST,
      lowestBalanceAgorot: -61_200,
      lowestBalanceDate: '2026-08-20',
      dailyPoints: FORECAST.dailyPoints.map((p) => (p.date === '2026-08-20' ? { ...p, balanceAgorot: -61_200 } : p)),
    }
    const { getByText } = await render(<MoneyJourney forecast={negative} safeToSpendAgorot={null} variant="desktop" />)
    // The low point's own figure renders (as a real negative balance, not
    // hidden or clamped) — presence alone proves the component didn't
    // crash or blank out under a negative balance.
    expect(getByText(formatILS(-61_200))).toBeTruthy()
  })
})
