import { describe, expect, it } from '@jest/globals'
import { calculateCashFlowForecast, type CashFlowForecastInput } from './calculateCashFlowForecast'
import { calculateSafeToSpend } from './calculateSafeToSpend'
import { sumEligibleCashAgorot } from './eligibleCashAccounts'
import { getDayRangeHorizon } from './horizonRange'
import type { PlannedObligationForecastInput } from './calculateSafeToSpend'
import type { RecurringForecastTemplate } from './forecastRecurringOccurrences'
import type { InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'

function obligation(overrides: Partial<PlannedObligationForecastInput> = {}): PlannedObligationForecastInput {
  return {
    id: 'ob-1',
    name: 'ארנונה',
    amountAgorot: 47500,
    dueDate: '2026-08-20',
    status: 'upcoming',
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function recurring(overrides: Partial<RecurringForecastTemplate> = {}): RecurringForecastTemplate {
  return {
    id: 'rec-1',
    description: 'אינטרנט',
    amountAgorot: -15000,
    frequency: 'monthly',
    dayOfMonth: 18,
    nextDueDate: '2026-08-18',
    isActive: true,
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function installmentPlan(overrides: Partial<InstallmentPlanForecastTemplate> = {}): InstallmentPlanForecastTemplate {
  return {
    id: 'plan-1',
    description: 'מקרר חדש',
    totalAgorot: 300000,
    installmentCount: 3,
    monthlyAgorot: 100000,
    firstChargeDate: '2026-08-20',
    lastMaterializedIndex: 0,
    categoryId: null,
    accountId: null,
    ...overrides,
  }
}

function baseInput(overrides: Partial<CashFlowForecastInput> = {}): CashFlowForecastInput {
  return {
    startingBalanceAgorot: 500000,
    startDate: '2026-08-16',
    endDate: '2026-09-14',
    obligations: [],
    recurringTemplates: [],
    installmentPlans: [],
    ...overrides,
  }
}

describe('calculateCashFlowForecast', () => {
  it('with no events, the balance stays flat at the starting balance for every day', () => {
    const result = calculateCashFlowForecast(baseInput())
    expect(result.startingBalanceAgorot).toBe(500000)
    expect(result.endingBalanceAgorot).toBe(500000)
    expect(result.totalInflowsAgorot).toBe(0)
    expect(result.totalOutflowsAgorot).toBe(0)
    expect(result.lowestBalanceAgorot).toBe(500000)
    expect(result.lowestBalanceDate).toBe('2026-08-16')
    expect(result.firstShortfallDate).toBeNull()
    expect(result.upcomingObligationsCount).toBe(0)
    expect(result.events).toEqual([])
    expect(result.dailyPoints).toHaveLength(30)
    expect(result.dailyPoints.every((p) => p.balanceAgorot === 500000)).toBe(true)
  })

  it('applies a single expense obligation as an outflow on its due date', () => {
    const result = calculateCashFlowForecast(baseInput({ obligations: [obligation({ dueDate: '2026-08-20' })] }))
    expect(result.totalOutflowsAgorot).toBe(47500)
    expect(result.endingBalanceAgorot).toBe(452500)
    const point = result.dailyPoints.find((p) => p.date === '2026-08-20')
    expect(point?.balanceAgorot).toBe(452500)
    expect(result.dailyPoints.find((p) => p.date === '2026-08-19')?.balanceAgorot).toBe(500000)
  })

  it('sums multiple expense obligations across different days', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        obligations: [
          obligation({ id: 'ob-1', amountAgorot: 47500, dueDate: '2026-08-20' }),
          obligation({ id: 'ob-2', name: 'ביטוח', amountAgorot: 80000, dueDate: '2026-08-25' }),
        ],
      })
    )
    expect(result.totalOutflowsAgorot).toBe(127500)
    expect(result.endingBalanceAgorot).toBe(372500)
  })

  it('applies a recurring income template as an inflow', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        recurringTemplates: [recurring({ id: 'rec-salary', description: 'משכורת', amountAgorot: 850000, nextDueDate: '2026-08-25', dayOfMonth: 25 })],
      })
    )
    expect(result.totalInflowsAgorot).toBe(850000)
    expect(result.endingBalanceAgorot).toBe(1350000)
    const event = result.events.find((e) => e.sourceId === 'rec-salary')
    expect(event?.direction).toBe('inflow')
    expect(event?.amountAgorot).toBe(850000)
  })

  it('combines income and expenses correctly', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        obligations: [obligation({ dueDate: '2026-08-20' })],
        recurringTemplates: [
          recurring({ id: 'rec-salary', description: 'משכורת', amountAgorot: 850000, nextDueDate: '2026-08-25', dayOfMonth: 25 }),
          recurring({ id: 'rec-internet', amountAgorot: -15000, nextDueDate: '2026-08-18', dayOfMonth: 18 }),
        ],
      })
    )
    expect(result.totalInflowsAgorot).toBe(850000)
    expect(result.totalOutflowsAgorot).toBe(47500 + 15000)
    expect(result.endingBalanceAgorot).toBe(500000 + 850000 - 47500 - 15000)
  })

  it('aggregates same-day income and expense into one net figure before computing that day balance', () => {
    const income = recurring({ id: 'rec-salary', description: 'משכורת', amountAgorot: 850000, nextDueDate: '2026-08-20', dayOfMonth: 20 })
    const expense = obligation({ id: 'ob-rent', name: 'שכר דירה', amountAgorot: 450000, dueDate: '2026-08-20' })

    const result = calculateCashFlowForecast(baseInput({ obligations: [expense], recurringTemplates: [income] }))

    const point = result.dailyPoints.find((p) => p.date === '2026-08-20')
    expect(point?.inflowsAgorot).toBe(850000)
    expect(point?.outflowsAgorot).toBe(450000)
    // Never a misleading transient dip just because one of the two same-day
    // events could sort before the other — the net (income - expense) is
    // applied as a single step, not two sequential ones.
    expect(point?.balanceAgorot).toBe(500000 + 850000 - 450000)
  })

  it('produces an identical same-day aggregate regardless of which order same-day events appear in the input array', () => {
    const first = obligation({ id: 'ob-a', name: 'א', amountAgorot: 10000, dueDate: '2026-08-20' })
    const second = obligation({ id: 'ob-b', name: 'ב', amountAgorot: 20000, dueDate: '2026-08-20' })

    const orderAB = calculateCashFlowForecast(baseInput({ obligations: [first, second] }))
    const orderBA = calculateCashFlowForecast(baseInput({ obligations: [second, first] }))

    expect(orderAB.dailyPoints.find((p) => p.date === '2026-08-20')).toEqual(
      orderBA.dailyPoints.find((p) => p.date === '2026-08-20')
    )
    expect(orderAB.endingBalanceAgorot).toBe(orderBA.endingBalanceAgorot)
  })

  it('computes the correct ending balance after mixed events', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startingBalanceAgorot: 200000,
        obligations: [obligation({ amountAgorot: 50000, dueDate: '2026-08-18' })],
      })
    )
    expect(result.endingBalanceAgorot).toBe(150000)
  })

  it('finds the lowest balance and its date across the horizon', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startingBalanceAgorot: 300000,
        obligations: [
          obligation({ id: 'ob-1', amountAgorot: 250000, dueDate: '2026-08-18' }),
          obligation({ id: 'ob-2', amountAgorot: 100000, dueDate: '2026-08-28' }),
        ],
        recurringTemplates: [recurring({ id: 'rec-salary', amountAgorot: 850000, nextDueDate: '2026-08-25', dayOfMonth: 25 })],
      })
    )
    // Balance path: 300000 -> (8/18) 50000 -> (8/25) 900000 -> (8/28) 800000
    expect(result.lowestBalanceAgorot).toBe(50000)
    expect(result.lowestBalanceDate).toBe('2026-08-18')
  })

  it('detects the first shortfall date when the balance dips below zero', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startingBalanceAgorot: 30000,
        obligations: [obligation({ amountAgorot: 47500, dueDate: '2026-08-20' })],
      })
    )
    expect(result.firstShortfallDate).toBe('2026-08-20')
  })

  it('reports no shortfall when the balance never goes negative', () => {
    const result = calculateCashFlowForecast(baseInput({ obligations: [obligation({ amountAgorot: 1000 })] }))
    expect(result.firstShortfallDate).toBeNull()
  })

  it('detects shortfall then recovery: firstShortfallDate is the FIRST dip, even if the balance later recovers positive', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startingBalanceAgorot: 10000,
        obligations: [obligation({ id: 'ob-1', amountAgorot: 50000, dueDate: '2026-08-18' })],
        recurringTemplates: [recurring({ id: 'rec-salary', amountAgorot: 850000, nextDueDate: '2026-08-25', dayOfMonth: 25 })],
      })
    )
    expect(result.firstShortfallDate).toBe('2026-08-18')
    expect(result.endingBalanceAgorot).toBe(10000 - 50000 + 850000)
    expect(result.endingBalanceAgorot).toBeGreaterThan(0)
  })

  it('starts from a negative starting balance and computes correctly throughout', () => {
    const result = calculateCashFlowForecast(baseInput({ startingBalanceAgorot: -20000 }))
    expect(result.startingBalanceAgorot).toBe(-20000)
    expect(result.endingBalanceAgorot).toBe(-20000)
    expect(result.firstShortfallDate).toBe('2026-08-16')
    expect(result.lowestBalanceAgorot).toBe(-20000)
  })

  it('applies an overdue-but-still-upcoming obligation at day 0 (startDate), flagged pastDue', () => {
    const result = calculateCashFlowForecast(
      baseInput({ startDate: '2026-08-16', obligations: [obligation({ dueDate: '2026-08-01' })] })
    )
    const event = result.events.find((e) => e.sourceId === 'ob-1')
    expect(event?.date).toBe('2026-08-16')
    expect(event?.pastDue).toBe(true)
    expect(result.dailyPoints[0]?.date).toBe('2026-08-16')
    expect(result.dailyPoints[0]?.balanceAgorot).toBe(500000 - 47500)
  })

  it('does not flag a same-day (not actually overdue) obligation as pastDue', () => {
    const result = calculateCashFlowForecast(
      baseInput({ startDate: '2026-08-16', obligations: [obligation({ dueDate: '2026-08-16' })] })
    )
    expect(result.events[0]?.pastDue).toBe(false)
    expect(result.events[0]?.date).toBe('2026-08-16')
  })

  it('ignores an obligation due after the horizon end', () => {
    const result = calculateCashFlowForecast(baseInput({ endDate: '2026-09-14', obligations: [obligation({ dueDate: '2026-09-15' })] }))
    expect(result.events).toEqual([])
    expect(result.endingBalanceAgorot).toBe(500000)
  })

  it('ignores a completed obligation', () => {
    const result = calculateCashFlowForecast(baseInput({ obligations: [obligation({ status: 'completed' })] }))
    expect(result.events).toEqual([])
  })

  it('ignores a cancelled obligation', () => {
    const result = calculateCashFlowForecast(baseInput({ obligations: [obligation({ status: 'cancelled' })] }))
    expect(result.events).toEqual([])
  })

  it('ignores an inactive recurring template', () => {
    const result = calculateCashFlowForecast(baseInput({ recurringTemplates: [recurring({ isActive: false })] }))
    expect(result.events).toEqual([])
  })

  it('produces a 30-day horizon with 30 daily points', () => {
    const horizon = getDayRangeHorizon(30, '2026-08-16')
    const result = calculateCashFlowForecast(baseInput({ startDate: horizon.start, endDate: horizon.end }))
    expect(result.dailyPoints).toHaveLength(30)
  })

  it('produces a 60-day horizon with 60 daily points', () => {
    const horizon = getDayRangeHorizon(60, '2026-08-16')
    const result = calculateCashFlowForecast(baseInput({ startDate: horizon.start, endDate: horizon.end }))
    expect(result.dailyPoints).toHaveLength(60)
  })

  it('produces a 90-day horizon with 90 daily points', () => {
    const horizon = getDayRangeHorizon(90, '2026-08-16')
    const result = calculateCashFlowForecast(baseInput({ startDate: horizon.start, endDate: horizon.end }))
    expect(result.dailyPoints).toHaveLength(90)
  })

  it('handles a month boundary correctly', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startDate: '2026-08-25',
        endDate: '2026-09-05',
        obligations: [obligation({ dueDate: '2026-09-01' })],
      })
    )
    expect(result.dailyPoints.find((p) => p.date === '2026-09-01')?.outflowsAgorot).toBe(47500)
  })

  it('handles a year boundary correctly', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startDate: '2026-12-25',
        endDate: '2027-01-10',
        obligations: [obligation({ dueDate: '2027-01-01' })],
      })
    )
    expect(result.dailyPoints.find((p) => p.date === '2027-01-01')?.outflowsAgorot).toBe(47500)
    expect(result.dailyPoints[result.dailyPoints.length - 1]?.date).toBe('2027-01-10')
  })

  it('handles a leap year February correctly', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startDate: '2028-02-20',
        endDate: '2028-03-05',
        obligations: [obligation({ dueDate: '2028-02-29' })],
      })
    )
    expect(result.dailyPoints.find((p) => p.date === '2028-02-29')?.outflowsAgorot).toBe(47500)
  })

  it('handles a monthly recurring template due on the 31st across a 30-day month', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startDate: '2026-08-25',
        endDate: '2026-10-05',
        recurringTemplates: [recurring({ dayOfMonth: 31, nextDueDate: '2026-08-31', amountAgorot: -10000 })],
      })
    )
    const dates = result.events.filter((e) => e.source === 'recurring').map((e) => e.date)
    expect(dates).toEqual(['2026-08-31', '2026-09-30'])
  })

  it('does not double count an already-generated recurring occurrence (next_due_date already advanced)', () => {
    // A generation run already advanced next_due_date past the occurrence
    // that would have been due today — the forecast must start exactly
    // there, never re-add the already-posted one.
    const result = calculateCashFlowForecast(
      baseInput({
        startDate: '2026-08-16',
        endDate: '2026-09-14',
        recurringTemplates: [recurring({ nextDueDate: '2026-09-18', dayOfMonth: 18 })],
      })
    )
    expect(result.events).toEqual([])
    expect(result.endingBalanceAgorot).toBe(500000)
  })

  it('produces only integer agorot in every numeric field', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        startingBalanceAgorot: 500001,
        obligations: [obligation({ amountAgorot: 47501 })],
        recurringTemplates: [recurring({ amountAgorot: -15003 }), recurring({ id: 'rec-salary', amountAgorot: 850007, nextDueDate: '2026-08-25', dayOfMonth: 25 })],
      })
    )
    const values = [
      result.startingBalanceAgorot,
      result.endingBalanceAgorot,
      result.totalInflowsAgorot,
      result.totalOutflowsAgorot,
      result.lowestBalanceAgorot,
      ...result.events.map((e) => e.amountAgorot),
      ...result.dailyPoints.flatMap((p) => [p.balanceAgorot, p.inflowsAgorot, p.outflowsAgorot]),
    ]
    for (const value of values) expect(Number.isInteger(value)).toBe(true)
  })

  it('applies a not-yet-materialized instalment as an outflow on its charge date', () => {
    const result = calculateCashFlowForecast(baseInput({ installmentPlans: [installmentPlan({ firstChargeDate: '2026-08-20' })] }))
    expect(result.totalOutflowsAgorot).toBe(100000)
    expect(result.endingBalanceAgorot).toBe(400000)
    const event = result.events.find((e) => e.source === 'installment_plan')
    expect(event?.direction).toBe('outflow')
    expect(event?.amountAgorot).toBe(100000)
    expect(event?.sourceId).toBe('plan-1')
  })

  it('forecasts every not-yet-materialized instalment within the horizon, each on its own charge date', () => {
    const result = calculateCashFlowForecast(
      baseInput({ endDate: '2026-09-30', installmentPlans: [installmentPlan()] })
    )
    const dates = result.events.filter((e) => e.source === 'installment_plan').map((e) => e.date)
    expect(dates).toEqual(['2026-08-20', '2026-09-20'])
  })

  it('applies an overdue instalment at day 0 (startDate), flagged pastDue', () => {
    const result = calculateCashFlowForecast(
      baseInput({ startDate: '2026-08-16', installmentPlans: [installmentPlan({ firstChargeDate: '2026-08-01' })] })
    )
    const event = result.events.find((e) => e.source === 'installment_plan' && e.sourceId === 'plan-1')
    expect(event?.pastDue).toBe(true)
    expect(event?.date).toBe('2026-08-16')
  })

  it('ignores an instalment plan that is already fully materialized', () => {
    const result = calculateCashFlowForecast(baseInput({ installmentPlans: [installmentPlan({ lastMaterializedIndex: 3 })] }))
    expect(result.events).toEqual([])
  })

  it('counts upcoming obligations correctly, excluding recurring items', () => {
    const result = calculateCashFlowForecast(
      baseInput({
        obligations: [obligation({ id: 'ob-1' }), obligation({ id: 'ob-2', dueDate: '2026-08-22' })],
        recurringTemplates: [recurring()],
      })
    )
    expect(result.upcomingObligationsCount).toBe(2)
  })

  describe('shared starting-balance reconciliation with Safe-to-Spend', () => {
    it("the forecast's day-0 starting balance reconciles exactly with Safe-to-Spend's availableCashAgorot for the same accounts/balances", () => {
      const accounts = [
        { id: 'checking-1', type: 'checking', is_active: true, include_in_total: true },
        { id: 'savings-1', type: 'savings', is_active: true, include_in_total: true },
      ]
      const balances = { 'checking-1': 830000, 'savings-1': 5000000 }
      const availableCashAgorot = sumEligibleCashAgorot(accounts, balances)

      const safeToSpend = calculateSafeToSpend({
        availableCashAgorot,
        obligations: [obligation()],
        recurringTemplates: [recurring()],
        installmentPlans: [],
        horizonEnd: '2026-08-31',
      })
      const forecast = calculateCashFlowForecast({
        startingBalanceAgorot: availableCashAgorot,
        startDate: '2026-08-16',
        endDate: '2026-08-31',
        obligations: [obligation()],
        recurringTemplates: [recurring()],
        installmentPlans: [],
      })

      expect(safeToSpend.availableCashAgorot).toBe(availableCashAgorot)
      expect(forecast.startingBalanceAgorot).toBe(availableCashAgorot)
      expect(forecast.startingBalanceAgorot).toBe(safeToSpend.availableCashAgorot)
      expect(forecast.dailyPoints[0]?.balanceAgorot).not.toBeUndefined()
    })
  })
})
