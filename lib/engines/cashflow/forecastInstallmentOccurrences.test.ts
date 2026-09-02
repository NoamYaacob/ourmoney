import { describe, expect, it } from '@jest/globals'
import { forecastInstallmentOccurrences, type InstallmentPlanForecastTemplate } from './forecastInstallmentOccurrences'

function plan(overrides: Partial<InstallmentPlanForecastTemplate> = {}): InstallmentPlanForecastTemplate {
  return {
    id: 'plan-1',
    description: 'מקרר חדש',
    totalAgorot: 300000,
    installmentCount: 3,
    monthlyAgorot: 100000,
    firstChargeDate: '2026-08-10',
    lastMaterializedIndex: 0,
    categoryId: 'cat-1',
    accountId: 'acc-1',
    ...overrides,
  }
}

describe('forecastInstallmentOccurrences', () => {
  it('forecasts every not-yet-materialized instalment within the horizon, evenly divisible amount', () => {
    const result = forecastInstallmentOccurrences([plan()], '2026-10-31')
    expect(result).toEqual([
      { installmentPlanId: 'plan-1', description: 'מקרר חדש', amountAgorot: -100000, installmentIndex: 1, date: '2026-08-10', categoryId: 'cat-1', accountId: 'acc-1' },
      { installmentPlanId: 'plan-1', description: 'מקרר חדש', amountAgorot: -100000, installmentIndex: 2, date: '2026-09-10', categoryId: 'cat-1', accountId: 'acc-1' },
      { installmentPlanId: 'plan-1', description: 'מקרר חדש', amountAgorot: -100000, installmentIndex: 3, date: '2026-10-10', categoryId: 'cat-1', accountId: 'acc-1' },
    ])
  })

  it('the last instalment absorbs the floor-division remainder, matching generate_installment_transactions()', () => {
    const result = forecastInstallmentOccurrences(
      [plan({ totalAgorot: 100000, installmentCount: 3, monthlyAgorot: 33333 })],
      '2026-10-31'
    )
    expect(result.map((o) => o.amountAgorot)).toEqual([-33333, -33333, -33334])
    expect(result.reduce((sum, o) => sum - o.amountAgorot, 0)).toBe(100000)
  })

  it('resumes forecasting from lastMaterializedIndex + 1, never re-reporting an already-generated instalment', () => {
    const result = forecastInstallmentOccurrences([plan({ lastMaterializedIndex: 1 })], '2026-10-31')
    expect(result.map((o) => o.installmentIndex)).toEqual([2, 3])
    expect(result.map((o) => o.date)).toEqual(['2026-09-10', '2026-10-10'])
  })

  it('returns nothing once every instalment has already materialized', () => {
    const result = forecastInstallmentOccurrences([plan({ lastMaterializedIndex: 3 })], '2026-12-31')
    expect(result).toEqual([])
  })

  it('excludes an occurrence whose date is after the horizon end', () => {
    const result = forecastInstallmentOccurrences([plan()], '2026-09-30')
    expect(result.map((o) => o.installmentIndex)).toEqual([1, 2])
  })

  it('includes an occurrence exactly on the horizon end (inclusive)', () => {
    const result = forecastInstallmentOccurrences([plan()], '2026-08-10')
    expect(result).toHaveLength(1)
  })

  it('reports every amount as negative — an instalment is always an expense', () => {
    const result = forecastInstallmentOccurrences([plan()], '2026-10-31')
    expect(result.every((o) => o.amountAgorot < 0)).toBe(true)
  })

  it('clamps a charge date on the 31st crossing shorter months, matching Postgres date+interval semantics', () => {
    const result = forecastInstallmentOccurrences(
      [plan({ firstChargeDate: '2026-01-31', installmentCount: 4, totalAgorot: 400000, monthlyAgorot: 100000 })],
      '2026-12-31'
    )
    // index 1: Jan 31 (+0mo) = Jan 31
    // index 2: Jan 31 (+1mo) = Feb 28 (2026 not a leap year, clamped)
    // index 3: Jan 31 (+2mo) = Mar 31 (computed fresh from Jan 31, not from Feb 28 — no drift)
    // index 4: Jan 31 (+3mo) = Apr 30 (clamped)
    expect(result.map((o) => o.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('clamps correctly across a leap-year February', () => {
    const result = forecastInstallmentOccurrences(
      [plan({ firstChargeDate: '2028-01-31', installmentCount: 2, totalAgorot: 200000, monthlyAgorot: 100000 })],
      '2028-12-31'
    )
    expect(result.map((o) => o.date)).toEqual(['2028-01-31', '2028-02-29'])
  })

  it('does not cross-contaminate multiple independent plans', () => {
    const fridge = plan({ id: 'plan-fridge', description: 'מקרר' })
    const laptop = plan({ id: 'plan-laptop', description: 'מחשב נייד', totalAgorot: 600000, monthlyAgorot: 200000, firstChargeDate: '2026-08-20' })
    const result = forecastInstallmentOccurrences([fridge, laptop], '2026-08-31')
    expect(result).toHaveLength(2)
    expect(result.find((o) => o.installmentPlanId === 'plan-fridge')?.amountAgorot).toBe(-100000)
    expect(result.find((o) => o.installmentPlanId === 'plan-laptop')?.amountAgorot).toBe(-200000)
  })

  it('returns an empty array for an empty plan list', () => {
    expect(forecastInstallmentOccurrences([], '2026-12-31')).toEqual([])
  })
})
