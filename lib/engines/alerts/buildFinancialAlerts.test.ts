import { describe, expect, it } from '@jest/globals'
import { buildFinancialAlerts, type BuildFinancialAlertsInput } from './buildFinancialAlerts'
import type { CashFlowForecastResult } from '../cashflow/calculateCashFlowForecast'
import type { PlannedObligationForecastInput } from '../cashflow/calculateSafeToSpend'
import type { PriceIncreaseDetection } from '@/features/recurring/lib/priceIncreaseDetection'
import type { BudgetCategoryProgress } from '@/types/app'

const TODAY = '2026-08-16'

function forecast(overrides: Partial<CashFlowForecastResult> = {}): CashFlowForecastResult {
  return {
    startingBalanceAgorot: 500000,
    endingBalanceAgorot: 500000,
    totalInflowsAgorot: 0,
    totalOutflowsAgorot: 0,
    lowestBalanceAgorot: 500000,
    lowestBalanceDate: TODAY,
    firstShortfallDate: null,
    upcomingObligationsCount: 0,
    events: [],
    dailyPoints: [],
    ...overrides,
  }
}

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

function priceIncrease(overrides: Partial<PriceIncreaseDetection> = {}): PriceIncreaseDetection {
  return {
    identityKey: 'recurring:rec-1',
    recurringId: 'rec-1',
    description: 'אינטרנט',
    previousAmountAgorot: 9900,
    currentAmountAgorot: 11900,
    increaseAgorot: 2000,
    increasePercent: 20.2,
    detectedAt: '2026-08-01',
    currentTransactionId: 'txn-1',
    ...overrides,
  }
}

function budgetCategory(overrides: Partial<BudgetCategoryProgress> = {}): BudgetCategoryProgress {
  return {
    categoryId: 'cat-1',
    categoryNameHe: 'מכולת',
    categoryIcon: '🛒',
    allocatedAgorot: 100000,
    spentAgorot: 50000,
    remainingAgorot: 50000,
    percentSpent: 50,
    ...overrides,
  }
}

function baseInput(overrides: Partial<BuildFinancialAlertsInput> = {}): BuildFinancialAlertsInput {
  return {
    today: TODAY,
    forecast: null,
    obligations: [],
    priceIncreaseDetections: [],
    budgetCategories: [],
    ...overrides,
  }
}

describe('buildFinancialAlerts', () => {
  it('returns no alerts when nothing meets any threshold', () => {
    expect(buildFinancialAlerts(baseInput())).toEqual([])
  })

  it('produces a critical alert for an overdue obligation', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-10' })] }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('critical')
    expect(alerts[0]?.type).toBe('upcoming_obligation')
  })

  it('produces a warning alert for an obligation due today', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: TODAY })] }))
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces a warning alert for an obligation due in 3 days', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-19' })] }))
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces an info alert for an obligation due in 7 days', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-23' })] }))
    expect(alerts[0]?.severity).toBe('info')
  })

  it('produces no alert for an obligation due beyond 7 days', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-24' })] }))
    expect(alerts).toEqual([])
  })

  it('ignores a completed obligation entirely', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ status: 'completed', dueDate: '2026-08-10' })] }))
    expect(alerts).toEqual([])
  })

  it('ignores a cancelled obligation entirely', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ status: 'cancelled', dueDate: '2026-08-10' })] }))
    expect(alerts).toEqual([])
  })

  it('produces a critical forecast-shortfall alert within 3 days', () => {
    const alerts = buildFinancialAlerts(
      baseInput({ forecast: forecast({ firstShortfallDate: '2026-08-18', lowestBalanceAgorot: -12400 }) })
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('forecast_shortfall')
    expect(alerts[0]?.severity).toBe('critical')
    expect(alerts[0]?.amountAgorot).toBe(12400)
  })

  it('reports the balance on firstShortfallDate itself, not the horizon-wide lowest balance', () => {
    // A small early dip (day of firstShortfallDate) that recovers, followed
    // by a much deeper dip later in the horizon (e.g. an annual payment).
    // The alert must report the FIRST day's own deficit (1000), never the
    // horizon-wide lowestBalanceAgorot (50000) from the later, unrelated day.
    const alerts = buildFinancialAlerts(
      baseInput({
        forecast: forecast({
          firstShortfallDate: '2026-08-18',
          lowestBalanceAgorot: -50000,
          lowestBalanceDate: '2026-09-10',
          dailyPoints: [
            { date: '2026-08-17', balanceAgorot: 500, inflowsAgorot: 0, outflowsAgorot: 0 },
            { date: '2026-08-18', balanceAgorot: -1000, inflowsAgorot: 0, outflowsAgorot: 1500 },
            { date: '2026-08-19', balanceAgorot: 200, inflowsAgorot: 1200, outflowsAgorot: 0 },
            { date: '2026-09-10', balanceAgorot: -50000, inflowsAgorot: 0, outflowsAgorot: 50200 },
          ],
        }),
      })
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('forecast_shortfall')
    expect(alerts[0]?.date).toBe('2026-08-18')
    expect(alerts[0]?.amountAgorot).toBe(1000)
  })

  it('produces a warning forecast-shortfall alert 4-14 days out', () => {
    const alerts = buildFinancialAlerts(
      baseInput({ forecast: forecast({ firstShortfallDate: '2026-08-25', lowestBalanceAgorot: -5000 }) })
    )
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces no alert when the forecast has no shortfall', () => {
    const alerts = buildFinancialAlerts(baseInput({ forecast: forecast({ firstShortfallDate: null }) }))
    expect(alerts).toEqual([])
  })

  it('produces no alert when the forecast is unavailable (null, e.g. that source errored)', () => {
    const alerts = buildFinancialAlerts(baseInput({ forecast: null }))
    expect(alerts).toEqual([])
  })

  it('produces a recurring price-increase alert from an existing detection', () => {
    const alerts = buildFinancialAlerts(baseInput({ priceIncreaseDetections: [priceIncrease()] }))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.type).toBe('recurring_price_increase')
    expect(alerts[0]?.severity).toBe('warning')
    expect(alerts[0]?.amountAgorot).toBe(2000)
  })

  it('produces no price-increase alert when there are no detections (a stable recurring price)', () => {
    const alerts = buildFinancialAlerts(baseInput({ priceIncreaseDetections: [] }))
    expect(alerts).toEqual([])
  })

  it('produces no budget alert at 79%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 79 })] }))
    expect(alerts).toEqual([])
  })

  it('produces a warning budget alert at 80%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 80 })] }))
    expect(alerts[0]?.type).toBe('budget_risk')
    expect(alerts[0]?.severity).toBe('warning')
  })

  it('produces a stronger (critical) budget alert above 100%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 115 })] }))
    expect(alerts[0]?.severity).toBe('critical')
  })

  it('produces deterministic ids: same input twice produces identical ids', () => {
    const input = baseInput({
      obligations: [obligation()],
      priceIncreaseDetections: [priceIncrease()],
      budgetCategories: [budgetCategory({ percentSpent: 90 })],
    })
    const first = buildFinancialAlerts(input).map((a) => a.id)
    const second = buildFinancialAlerts(input).map((a) => a.id)
    expect(first).toEqual(second)
  })

  it('produces exactly one alert per obligation, never a separate overdue+upcoming pair for the same obligation', () => {
    const alerts = buildFinancialAlerts(baseInput({ obligations: [obligation({ dueDate: '2026-08-01' })] }))
    expect(alerts.filter((a) => a.sourceId === 'ob-1')).toHaveLength(1)
  })

  it('produces exactly one alert per over-threshold budget category, never two for both 80% and 100%', () => {
    const alerts = buildFinancialAlerts(baseInput({ budgetCategories: [budgetCategory({ percentSpent: 120 })] }))
    expect(alerts.filter((a) => a.sourceId === 'cat-1')).toHaveLength(1)
    expect(alerts[0]?.severity).toBe('critical')
  })

  it('never produces duplicate alert ids across two different independent sources', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [obligation({ id: 'ob-1' }), obligation({ id: 'ob-2', dueDate: TODAY })],
        priceIncreaseDetections: [priceIncrease({ identityKey: 'recurring:rec-1' })],
        budgetCategories: [budgetCategory({ categoryId: 'cat-1', percentSpent: 90 })],
      })
    )
    const ids = alerts.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the four alert-type id prefixes can never collide with each other, even with matching sourceIds', () => {
    // Deliberately reuse the SAME literal string as an obligation id, a
    // recurring identityKey, and a category id — if the prefixes weren't
    // disjoint, these would collide into fewer than 3 alerts (plus the
    // always-present forecast_shortfall alert = 4 total).
    const sharedId = 'shared-id'
    const alerts = buildFinancialAlerts(
      baseInput({
        forecast: forecast({ firstShortfallDate: '2026-08-18', lowestBalanceAgorot: -1000 }),
        obligations: [obligation({ id: sharedId, dueDate: '2026-08-18' })],
        priceIncreaseDetections: [priceIncrease({ identityKey: sharedId })],
        budgetCategories: [budgetCategory({ categoryId: sharedId, percentSpent: 90 })],
      })
    )
    const ids = alerts.map((a) => a.id)
    expect(new Set(ids).size).toBe(4)
    expect(alerts).toHaveLength(4)
  })

  it('sorts by severity first: critical before warning before info', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [obligation({ id: 'ob-info', dueDate: '2026-08-22' })], // info
        priceIncreaseDetections: [priceIncrease()], // warning
        forecast: forecast({ firstShortfallDate: '2026-08-17', lowestBalanceAgorot: -1000 }), // critical
      })
    )
    expect(alerts.map((a) => a.severity)).toEqual(['critical', 'warning', 'info'])
  })

  it('sorts by date within the same severity tier, soonest first', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [
          obligation({ id: 'ob-later', dueDate: '2026-08-19' }),
          obligation({ id: 'ob-sooner', dueDate: TODAY }),
        ],
      })
    )
    expect(alerts.every((a) => a.severity === 'warning')).toBe(true)
    expect(alerts.map((a) => a.sourceId)).toEqual(['ob-sooner', 'ob-later'])
  })

  it('sorts an undated alert (budget_risk) after dated alerts within the same severity tier', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        obligations: [obligation({ dueDate: TODAY })], // warning, dated
        budgetCategories: [budgetCategory({ percentSpent: 85 })], // warning, undated
      })
    )
    expect(alerts.map((a) => a.type)).toEqual(['upcoming_obligation', 'budget_risk'])
  })

  it('combines all four sources into one correctly-populated, correctly-ordered list', () => {
    const alerts = buildFinancialAlerts(
      baseInput({
        forecast: forecast({ firstShortfallDate: '2026-08-18', lowestBalanceAgorot: -12400 }),
        obligations: [obligation({ dueDate: '2026-08-20' })],
        priceIncreaseDetections: [priceIncrease()],
        budgetCategories: [budgetCategory({ percentSpent: 90 })],
      })
    )
    expect(alerts).toHaveLength(4)
    expect(alerts.map((a) => a.type).sort()).toEqual(
      ['budget_risk', 'forecast_shortfall', 'recurring_price_increase', 'upcoming_obligation'].sort()
    )
  })
})
