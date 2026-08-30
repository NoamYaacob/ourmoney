import { describe, expect, it } from '@jest/globals'
import { buildMoneyJourneySteps } from './moneyJourneySteps'
import type { CashFlowForecastEvent, CashFlowForecastResult } from '@/lib/engines/cashflow/calculateCashFlowForecast'

function event(overrides: Partial<CashFlowForecastEvent> & Pick<CashFlowForecastEvent, 'id' | 'date' | 'amountAgorot' | 'direction' | 'title'>): CashFlowForecastEvent {
  return {
    source: 'planned_obligation',
    sourceId: overrides.id,
    pastDue: false,
    ...overrides,
  }
}

// A hand-built 6-day forecast (16th-21st): a same-day cluster on the 19th,
// a severe salary inflow on the 17th, a severe rent outflow on the 18th, a
// new (non-global) local low on the 19th, the global low on the 20th, and a
// small routine inflow on the 21st. Every dailyPoint balance/inflow/outflow
// below is hand-verified against its own day's events so the fixture itself
// is internally consistent, the same discipline calculateCashFlowForecast.ts
// enforces for real data.
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

const clusterLabel = (count: number) => `${count} events`

describe('buildMoneyJourneySteps', () => {
  it('produces one step per real event date, never a step for an event-free day', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    expect(steps.map((s) => s.date)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'])
  })

  it('the BEFORE -> DELTA -> AFTER identity holds exactly for every step', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    for (const step of steps) {
      expect(step.beforeBalanceAgorot + step.deltaAgorot).toBe(step.afterBalanceAgorot)
    }
  })

  it('names a single-event step by the event’s own real title, never invented text', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const salary = steps.find((s) => s.date === '2026-08-17')!
    expect(salary.cause).toBe('משכורת')
    expect(salary.clusterCount).toBe(1)
  })

  it('names a same-day cluster with the real count, not a made-up description', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const cluster = steps.find((s) => s.date === '2026-08-19')!
    expect(cluster.clusterCount).toBe(2)
    expect(cluster.cause).toBe('2 events')
    expect(cluster.events.map((e) => e.id).sort()).toEqual(['e-car', 'e-refund'])
  })

  it('tiers a severe-magnitude inflow as high priority (a meaningful inflow, per the CP8B brief’s own example)', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const salary = steps.find((s) => s.date === '2026-08-17')!
    expect(salary.severe).toBe(true)
    expect(salary.priority).toBe('high')
  })

  it('tiers a severe-magnitude outflow (a large obligation/payment) as high priority', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const rent = steps.find((s) => s.date === '2026-08-18')!
    expect(rent.severe).toBe(true)
    expect(rent.priority).toBe('high')
  })

  it('tiers the global low point as critical, and does not also mark it a "local" low', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const low = steps.find((s) => s.date === '2026-08-20')!
    expect(low.isLow).toBe(true)
    expect(low.isLocalLow).toBe(false)
    expect(low.priority).toBe('critical')
  })

  it('tiers a new running-minimum day that is NOT the global low as high priority, distinct from the low point', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const localLow = steps.find((s) => s.date === '2026-08-19')!
    expect(localLow.isLocalLow).toBe(true)
    expect(localLow.isLow).toBe(false)
    expect(localLow.priority).toBe('high')
  })

  it('tiers a small, single, non-dipping event as routine', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    const routine = steps.find((s) => s.date === '2026-08-21')!
    expect(routine.severe).toBe(false)
    expect(routine.clusterCount).toBe(1)
    expect(routine.isLocalLow).toBe(false)
    expect(routine.priority).toBe('routine')
  })

  it('marks isConclusion only when the resulting balance truthfully equals Safe-to-Spend, and promotes it to critical', () => {
    const withMatch = buildMoneyJourneySteps(FORECAST, 550_000, clusterLabel)
    const rent = withMatch.find((s) => s.date === '2026-08-18')!
    expect(rent.isConclusion).toBe(true)
    expect(rent.priority).toBe('critical')

    const withoutMatch = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    expect(withoutMatch.every((s) => !s.isConclusion)).toBe(true)
  })

  it('never fabricates a conclusion match against a figure no step actually reaches', () => {
    const steps = buildMoneyJourneySteps(FORECAST, 999_999, clusterLabel)
    expect(steps.every((s) => !s.isConclusion)).toBe(true)
  })

  it('is deterministic: the same input always produces the same output', () => {
    const a = buildMoneyJourneySteps(FORECAST, 550_000, clusterLabel)
    const b = buildMoneyJourneySteps(FORECAST, 550_000, clusterLabel)
    expect(a).toEqual(b)
  })

  it('carries the real dailyPoints index for date-proportional placement', () => {
    const steps = buildMoneyJourneySteps(FORECAST, null, clusterLabel)
    expect(steps.find((s) => s.date === '2026-08-17')!.index).toBe(1)
    expect(steps.find((s) => s.date === '2026-08-20')!.index).toBe(4)
  })

  it('returns an empty list for a forecast with no events at all', () => {
    const empty: CashFlowForecastResult = {
      ...FORECAST,
      events: [],
      dailyPoints: [{ date: '2026-08-16', balanceAgorot: 500_000, inflowsAgorot: 0, outflowsAgorot: 0 }],
      lowestBalanceDate: '2026-08-16',
      lowestBalanceAgorot: 500_000,
    }
    expect(buildMoneyJourneySteps(empty, null, clusterLabel)).toEqual([])
  })
})
