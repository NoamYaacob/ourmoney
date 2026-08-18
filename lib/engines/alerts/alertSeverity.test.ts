import { describe, expect, it } from '@jest/globals'
import {
  BUDGET_RISK_CRITICAL_PERCENT,
  BUDGET_RISK_WARNING_PERCENT,
  budgetRiskSeverity,
  daysBetween,
  forecastShortfallSeverity,
  obligationAlertSeverity,
  SEVERITY_ORDER,
} from './alertSeverity'

describe('obligationAlertSeverity', () => {
  it('is critical for any overdue obligation', () => {
    expect(obligationAlertSeverity(-1)).toBe('critical')
    expect(obligationAlertSeverity(-30)).toBe('critical')
  })

  it('is warning when due today', () => {
    expect(obligationAlertSeverity(0)).toBe('warning')
  })

  it('is warning when due within 3 days', () => {
    expect(obligationAlertSeverity(3)).toBe('warning')
  })

  it('is info when due in 4-7 days', () => {
    expect(obligationAlertSeverity(4)).toBe('info')
    expect(obligationAlertSeverity(7)).toBe('info')
  })

  it('is no alert (null) beyond 7 days', () => {
    expect(obligationAlertSeverity(8)).toBeNull()
    expect(obligationAlertSeverity(30)).toBeNull()
  })
})

describe('forecastShortfallSeverity', () => {
  it('is critical within 3 days', () => {
    expect(forecastShortfallSeverity(0)).toBe('critical')
    expect(forecastShortfallSeverity(3)).toBe('critical')
  })

  it('is warning within 4-14 days', () => {
    expect(forecastShortfallSeverity(4)).toBe('warning')
    expect(forecastShortfallSeverity(14)).toBe('warning')
  })

  it('is info beyond 14 days', () => {
    expect(forecastShortfallSeverity(15)).toBe('info')
    expect(forecastShortfallSeverity(29)).toBe('info')
  })
})

describe('budgetRiskSeverity', () => {
  it('is no alert (null) below the warning threshold', () => {
    expect(budgetRiskSeverity(79)).toBeNull()
    expect(budgetRiskSeverity(0)).toBeNull()
  })

  it('is warning at exactly the warning threshold', () => {
    expect(budgetRiskSeverity(BUDGET_RISK_WARNING_PERCENT)).toBe('warning')
  })

  it('is warning between the warning and critical thresholds', () => {
    expect(budgetRiskSeverity(95)).toBe('warning')
  })

  it('is warning at exactly 100% (not yet exceeded)', () => {
    expect(budgetRiskSeverity(BUDGET_RISK_CRITICAL_PERCENT)).toBe('warning')
  })

  it('is critical strictly above 100%', () => {
    expect(budgetRiskSeverity(101)).toBe('critical')
    expect(budgetRiskSeverity(150)).toBe('critical')
  })

  it('handles a null percentSpent (no allocation) as no alert', () => {
    expect(budgetRiskSeverity(null)).toBeNull()
  })

  it('reuses the exact critical threshold checkThresholdCrossing.ts already exports (100)', () => {
    expect(BUDGET_RISK_CRITICAL_PERCENT).toBe(100)
  })
})

describe('SEVERITY_ORDER', () => {
  it('ranks critical before warning before info', () => {
    expect(SEVERITY_ORDER.critical).toBeLessThan(SEVERITY_ORDER.warning)
    expect(SEVERITY_ORDER.warning).toBeLessThan(SEVERITY_ORDER.info)
  })
})

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-08-16', '2026-08-16')).toBe(0)
  })

  it('returns a positive count for a future date', () => {
    expect(daysBetween('2026-08-16', '2026-08-20')).toBe(4)
  })

  it('returns a negative count for a past date', () => {
    expect(daysBetween('2026-08-16', '2026-08-10')).toBe(-6)
  })

  it('handles a month boundary', () => {
    expect(daysBetween('2026-08-28', '2026-09-02')).toBe(5)
  })

  it('handles a year boundary', () => {
    expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3)
  })

  it('handles a leap-year February', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })
})
