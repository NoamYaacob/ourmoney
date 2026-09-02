import { describe, expect, it } from '@jest/globals'
import { computeInstallmentMaterializedCounts, computeInstallmentMaxIndices } from './computeInstallmentMaterializedCounts'

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

// RRR §14 P0-1 regression: computeInstallmentMaterializedCounts (a row COUNT)
// is correct for display ("3 of 12 paid") but was also being fed into
// forecastInstallmentOccurrences as "the next index to forecast from" — which
// must be MAX(installment_index) + 1 to match generate_installment_transactions()
// (migration 016), not COUNT(rows) + 1. Once ANY materialized transaction is
// deleted (transactions_delete has no installment-aware guard), a plan's
// materialized set gets a gap, and COUNT diverges from MAX permanently: the
// forecaster then re-forecasts an index that already exists as a real,
// posted transaction, silently double-counting it in Safe-to-Spend, the
// cash-flow forecast, Upcoming Commitments, and Impact Check forever.
// computeInstallmentMaxIndices exists specifically to give forecasting its
// own, gap-safe source of truth — independent of the row-count used for
// display — mirroring generate_installment_transactions()'s own
// `SELECT COALESCE(MAX(installment_index), 0) + 1` exactly.
describe('computeInstallmentMaxIndices', () => {
  it('returns an empty record for no transactions', () => {
    expect(computeInstallmentMaxIndices([])).toEqual({})
  })

  it('returns the highest instalment_index for a gapless materialized set', () => {
    const result = computeInstallmentMaxIndices([
      { installment_plan_id: 'plan-1', installment_index: 1 },
      { installment_plan_id: 'plan-1', installment_index: 2 },
      { installment_plan_id: 'plan-1', installment_index: 3 },
    ])
    expect(result).toEqual({ 'plan-1': 3 })
  })

  it('reproduces the real-world double-count scenario: deleting one materialized instalment must not lower the next-forecast index below the true maximum', () => {
    // Indices 1, 3, 4 exist as real transactions — index 2 was deleted (e.g.
    // a mistaken duplicate an admin removed). A row COUNT would read 3,
    // making a COUNT-based forecaster resume at index 4 — which ALREADY
    // EXISTS as a real, posted transaction (index 4), producing a duplicate
    // forecast entry for money already spent. MAX must read 4, so
    // forecasting correctly resumes at index 5, matching exactly what
    // generate_installment_transactions() would generate next.
    const transactions = [
      { installment_plan_id: 'plan-1', installment_index: 1 },
      { installment_plan_id: 'plan-1', installment_index: 3 },
      { installment_plan_id: 'plan-1', installment_index: 4 },
    ]
    const maxIndex = computeInstallmentMaxIndices(transactions)['plan-1'] ?? 0
    const rowCount = computeInstallmentMaterializedCounts(transactions)['plan-1'] ?? 0
    expect(maxIndex).toBe(4)
    expect(rowCount).toBe(3)
    // The bug this guards against: COUNT-based next-index (3 + 1 = 4) would
    // collide with the real index-4 transaction. MAX-based next-index
    // (4 + 1 = 5) never does.
    expect(maxIndex + 1).not.toBe(rowCount + 1)
    expect(maxIndex + 1).toBe(5)
  })

  it('does not cross-contaminate max indices across different plans', () => {
    const result = computeInstallmentMaxIndices([
      { installment_plan_id: 'plan-1', installment_index: 5 },
      { installment_plan_id: 'plan-2', installment_index: 1 },
      { installment_plan_id: 'plan-1', installment_index: 2 },
    ])
    expect(result).toEqual({ 'plan-1': 5, 'plan-2': 1 })
  })

  it('ignores transactions with a null installment_plan_id or null installment_index', () => {
    const result = computeInstallmentMaxIndices([
      { installment_plan_id: null, installment_index: 9 },
      { installment_plan_id: 'plan-1', installment_index: null },
      { installment_plan_id: 'plan-1', installment_index: 2 },
    ])
    expect(result).toEqual({ 'plan-1': 2 })
  })

  it('a plan with no materialized instalments has no key in the returned record', () => {
    const result = computeInstallmentMaxIndices([{ installment_plan_id: 'plan-1', installment_index: 1 }])
    expect(result['plan-2']).toBeUndefined()
  })
})
