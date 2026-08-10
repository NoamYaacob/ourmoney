import { describe, expect, it } from '@jest/globals'
import { findMatchingRule, matchesRule } from './matchRule'

const baseRule = {
  field: 'description' as const,
  operator: 'contains' as const,
  value: 'סופר',
  is_case_sensitive: false,
}

describe('matchesRule', () => {
  it('matches "contains" case-insensitively by default', () => {
    expect(matchesRule(baseRule, { description: 'קניה בסופר יפה', merchant_name: null })).toBe(true)
  })

  it('does not match when the substring is absent', () => {
    expect(matchesRule(baseRule, { description: 'קניה במסעדה', merchant_name: null })).toBe(false)
  })

  it('matches "equals" only on an exact match', () => {
    const rule = { ...baseRule, operator: 'equals' as const, value: 'שופרסל' }
    expect(matchesRule(rule, { description: 'שופרסל', merchant_name: null })).toBe(true)
    expect(matchesRule(rule, { description: 'שופרסל דיל', merchant_name: null })).toBe(false)
  })

  it('matches "starts_with" only at the beginning', () => {
    const rule = { ...baseRule, operator: 'starts_with' as const, value: 'שופר' }
    expect(matchesRule(rule, { description: 'שופרסל', merchant_name: null })).toBe(true)
    expect(matchesRule(rule, { description: 'סניף שופרסל', merchant_name: null })).toBe(false)
  })

  it('respects case sensitivity when enabled', () => {
    const rule = { ...baseRule, value: 'ABC', is_case_sensitive: true }
    expect(matchesRule(rule, { description: 'abc store', merchant_name: null })).toBe(false)
    expect(matchesRule(rule, { description: 'ABC store', merchant_name: null })).toBe(true)
  })

  it('reads merchant_name when field is merchant_name', () => {
    const rule = { ...baseRule, field: 'merchant_name' as const, value: 'wolt' }
    expect(matchesRule(rule, { description: 'הזמנה', merchant_name: 'Wolt' })).toBe(true)
  })

  it('returns false when merchant_name is null and field targets it', () => {
    const rule = { ...baseRule, field: 'merchant_name' as const, value: 'wolt' }
    expect(matchesRule(rule, { description: 'הזמנה', merchant_name: null })).toBe(false)
  })
})

describe('findMatchingRule', () => {
  const rules = [
    { ...baseRule, value: 'סופר', sort_order: 2, is_active: true },
    { ...baseRule, value: 'שופרסל', sort_order: 1, is_active: true },
    { ...baseRule, value: 'שופרסל', sort_order: 0, is_active: false },
  ]

  it('returns the first matching rule in sort_order, skipping inactive rules', () => {
    const result = findMatchingRule(rules, { description: 'שופרסל דיל', merchant_name: null })
    expect(result?.sort_order).toBe(1)
  })

  it('returns null when no rule matches', () => {
    const result = findMatchingRule(rules, { description: 'מסעדה', merchant_name: null })
    expect(result).toBeNull()
  })
})
