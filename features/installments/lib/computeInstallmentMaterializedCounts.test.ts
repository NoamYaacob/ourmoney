import { describe, expect, it } from '@jest/globals'
import { computeInstallmentMaterializedCounts } from './computeInstallmentMaterializedCounts'

describe('computeInstallmentMaterializedCounts', () => {
  it('returns an empty record for no transactions', () => {
    expect(computeInstallmentMaterializedCounts([])).toEqual({})
  })

  it('counts one materialized instalment for one plan', () => {
    const result = computeInstallmentMaterializedCounts([{ installment_plan_id: 'plan-1' }])
    expect(result).toEqual({ 'plan-1': 1 })
  })

  it('counts multiple materialized instalments for the same plan', () => {
    const result = computeInstallmentMaterializedCounts([
      { installment_plan_id: 'plan-1' },
      { installment_plan_id: 'plan-1' },
      { installment_plan_id: 'plan-1' },
    ])
    expect(result).toEqual({ 'plan-1': 3 })
  })

  it('does not cross-contaminate counts across different plans', () => {
    const result = computeInstallmentMaterializedCounts([
      { installment_plan_id: 'plan-1' },
      { installment_plan_id: 'plan-2' },
      { installment_plan_id: 'plan-1' },
    ])
    expect(result).toEqual({ 'plan-1': 2, 'plan-2': 1 })
  })

  it('ignores transactions with a null installment_plan_id (a plan is not the only source of transactions)', () => {
    const result = computeInstallmentMaterializedCounts([
      { installment_plan_id: null },
      { installment_plan_id: 'plan-1' },
      { installment_plan_id: null },
    ])
    expect(result).toEqual({ 'plan-1': 1 })
  })

  it('a plan with zero materialized instalments has no key in the returned record', () => {
    const result = computeInstallmentMaterializedCounts([{ installment_plan_id: 'plan-1' }])
    expect(result['plan-2']).toBeUndefined()
  })
})
