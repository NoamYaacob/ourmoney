import { describe, expect, it } from '@jest/globals'
import { causeOfLowPoint } from './lowPointCause'
import type { CashFlowForecastEvent } from '@/lib/engines/cashflow/calculateCashFlowForecast'

function event(overrides: Partial<CashFlowForecastEvent> & { id: string; date: string }): CashFlowForecastEvent {
  return {
    amountAgorot: 100_00,
    direction: 'outflow',
    source: 'planned_obligation',
    sourceId: `src-${overrides.id}`,
    title: overrides.id,
    pastDue: false,
    ...overrides,
  }
}

describe('causeOfLowPoint', () => {
  it('picks the last outflow on or before the low point', () => {
    const events = [
      event({ id: 'rent', date: '2026-09-01' }),
      event({ id: 'car-licence', date: '2026-09-04' }),
      event({ id: 'insurance', date: '2026-09-12' }),
    ]

    expect(causeOfLowPoint(events, '2026-09-04')?.id).toBe('car-licence')
  })

  it('ignores inflows — a salary never causes a low point', () => {
    const events = [
      event({ id: 'car-licence', date: '2026-09-04' }),
      event({ id: 'salary', date: '2026-09-05', direction: 'inflow', amountAgorot: 13_950_00 }),
    ]

    // The low point sits on the salary's own date, but the money going OUT
    // the day before is what took the balance there.
    expect(causeOfLowPoint(events, '2026-09-05')?.id).toBe('car-licence')
  })

  it('ignores outflows after the low point', () => {
    const events = [
      event({ id: 'car-licence', date: '2026-09-04' }),
      event({ id: 'later-bill', date: '2026-09-20' }),
    ]

    expect(causeOfLowPoint(events, '2026-09-04')?.id).toBe('car-licence')
  })

  it('returns undefined when no outflow precedes the low point', () => {
    // A horizon whose balance simply starts at its lowest: labelling any
    // row "the cause" would be a claim the data does not support.
    const events = [event({ id: 'salary', date: '2026-09-05', direction: 'inflow' })]

    expect(causeOfLowPoint(events, '2026-09-01')).toBeUndefined()
    expect(causeOfLowPoint([], '2026-09-01')).toBeUndefined()
  })

  it('takes the latest date even if the engine ever stopped ordering events', () => {
    const events = [
      event({ id: 'car-licence', date: '2026-09-04' }),
      event({ id: 'earlier', date: '2026-09-01' }),
    ]

    expect(causeOfLowPoint(events, '2026-09-10')?.id).toBe('car-licence')
  })

  it('counts an outflow landing exactly on the low-point date', () => {
    const events = [event({ id: 'same-day', date: '2026-09-04' })]

    expect(causeOfLowPoint(events, '2026-09-04')?.id).toBe('same-day')
  })
})
