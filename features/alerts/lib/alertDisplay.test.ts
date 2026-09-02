// The fourth tier the design system names but the engine does not emit.

import { describe, expect, it } from '@jest/globals'
import { alertTier, tierIconName, TIER_BORDER_CLASS, TIER_LABEL_CLASS } from './alertDisplay'
import type { FinancialAlertSeverity, FinancialAlertType } from '@/types/app'

function a(type: FinancialAlertType, severity: FinancialAlertSeverity) {
  return { type, severity }
}

describe('alertTier', () => {
  it('reads spare cash as good news rather than as information', () => {
    // The engine has no "positive" severity and should not grow one — this
    // is how a finding reads, not how urgent it is.
    expect(alertTier(a('excess_cash_available', 'info'))).toBe('positive')
  })

  it('leaves every other info alert as information', () => {
    expect(alertTier(a('recurring_price_increase', 'info'))).toBe('info')
  })

  it('never promotes a warning or a critical alert into good news', () => {
    // A type could in principle be listed as positive and still arrive with
    // a severity — the severity has to win, or a shortfall could render as
    // a green checkmark.
    expect(alertTier(a('excess_cash_available', 'warning'))).toBe('warning')
    expect(alertTier(a('excess_cash_available', 'critical'))).toBe('critical')
  })

  it('passes the engine’s own three tiers straight through', () => {
    expect(alertTier(a('forecast_shortfall', 'critical'))).toBe('critical')
    expect(alertTier(a('budget_risk', 'warning'))).toBe('warning')
  })
})

describe('tier presentation', () => {
  it('gives every tier its own glyph, so colour never carries severity alone', () => {
    const icons = (['critical', 'warning', 'info', 'positive'] as const).map(tierIconName)
    expect(new Set(icons).size).toBe(4)
  })

  it('has a border and a label class for every tier', () => {
    for (const tier of ['critical', 'warning', 'info', 'positive'] as const) {
      expect(TIER_BORDER_CLASS[tier]).toBeTruthy()
      expect(TIER_LABEL_CLASS[tier]).toBeTruthy()
    }
  })
})
