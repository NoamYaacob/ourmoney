import { describe, expect, it } from '@jest/globals'
import { computeAccountBalances } from './computeAccountBalances'

describe('computeAccountBalances', () => {
  it('returns an empty record for empty input', () => {
    expect(computeAccountBalances([])).toEqual({})
  })

  it('sums a single account across multiple transactions', () => {
    const result = computeAccountBalances([
      { account_id: 'acct-1', amount_agorot: 10000 },
      { account_id: 'acct-1', amount_agorot: -2500 },
    ])
    expect(result).toEqual({ 'acct-1': 7500 })
  })

  it('groups sums separately per account', () => {
    const result = computeAccountBalances([
      { account_id: 'acct-1', amount_agorot: 10000 },
      { account_id: 'acct-2', amount_agorot: 5000 },
      { account_id: 'acct-1', amount_agorot: 2000 },
    ])
    expect(result).toEqual({ 'acct-1': 12000, 'acct-2': 5000 })
  })

  it('nets mixed income (positive) and expense (negative) signs correctly', () => {
    const result = computeAccountBalances([
      { account_id: 'acct-1', amount_agorot: 500000 }, // salary
      { account_id: 'acct-1', amount_agorot: -12000 }, // groceries
      { account_id: 'acct-1', amount_agorot: -30000 }, // rent share
    ])
    expect(result).toEqual({ 'acct-1': 458000 })
  })

  it('includes every transaction regardless of any shared/excluded status the caller might otherwise think to filter by', () => {
    // computeAccountBalances only ever receives account_id/amount_agorot, so
    // there is nothing here to filter on — this test documents (and locks
    // in) that a real account balance is the sum of everything that moved
    // money against the account, full stop.
    const result = computeAccountBalances([
      { account_id: 'acct-1', amount_agorot: -1000 },
      { account_id: 'acct-1', amount_agorot: -2000 },
      { account_id: 'acct-1', amount_agorot: -3000 },
    ])
    expect(result).toEqual({ 'acct-1': -6000 })
  })

  it('does not produce a key for an account with zero transactions', () => {
    const result = computeAccountBalances([{ account_id: 'acct-1', amount_agorot: 1000 }])
    expect(result).toEqual({ 'acct-1': 1000 })
    expect('acct-2' in result).toBe(false)
  })
})
