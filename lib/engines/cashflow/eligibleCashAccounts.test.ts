import { describe, expect, it } from '@jest/globals'
import { isEligibleCashAccount, sumEligibleCashAgorot, type EligibleCashAccountInput } from './eligibleCashAccounts'

function account(overrides: Partial<EligibleCashAccountInput> = {}): EligibleCashAccountInput {
  return { id: 'acc-1', type: 'checking', is_active: true, include_in_total: true, ...overrides }
}

describe('isEligibleCashAccount', () => {
  it('includes an active, included checking account', () => {
    expect(isEligibleCashAccount(account({ type: 'checking' }))).toBe(true)
  })

  it('includes an active, included cash account', () => {
    expect(isEligibleCashAccount(account({ type: 'cash' }))).toBe(true)
  })

  it('excludes a savings account', () => {
    expect(isEligibleCashAccount(account({ type: 'savings' }))).toBe(false)
  })

  it('excludes a credit card account', () => {
    expect(isEligibleCashAccount(account({ type: 'credit_card' }))).toBe(false)
  })

  it('excludes an investment account', () => {
    expect(isEligibleCashAccount(account({ type: 'investment' }))).toBe(false)
  })

  it('excludes an "other" account', () => {
    expect(isEligibleCashAccount(account({ type: 'other' }))).toBe(false)
  })

  it('excludes a loan account', () => {
    expect(isEligibleCashAccount(account({ type: 'loan' }))).toBe(false)
  })

  it('excludes a mortgage account', () => {
    expect(isEligibleCashAccount(account({ type: 'mortgage' }))).toBe(false)
  })

  it('excludes an inactive checking account', () => {
    expect(isEligibleCashAccount(account({ is_active: false }))).toBe(false)
  })

  it('excludes a checking account explicitly excluded from total', () => {
    expect(isEligibleCashAccount(account({ include_in_total: false }))).toBe(false)
  })
})

describe('sumEligibleCashAgorot', () => {
  it('sums only eligible accounts, ignoring savings/credit_card/investment/other', () => {
    const accounts = [
      account({ id: 'checking-1', type: 'checking' }),
      account({ id: 'cash-1', type: 'cash' }),
      account({ id: 'savings-1', type: 'savings' }),
      account({ id: 'credit-1', type: 'credit_card' }),
      account({ id: 'investment-1', type: 'investment' }),
      account({ id: 'other-1', type: 'other' }),
    ]
    const balances = {
      'checking-1': 500000,
      'cash-1': 20000,
      'savings-1': 1000000,
      'credit-1': -30000,
      'investment-1': 2000000,
      'other-1': 5000,
    }
    expect(sumEligibleCashAgorot(accounts, balances)).toBe(520000)
  })

  it('excludes an inactive or opted-out eligible-type account from the sum', () => {
    const accounts = [
      account({ id: 'checking-active', type: 'checking' }),
      account({ id: 'checking-inactive', type: 'checking', is_active: false }),
      account({ id: 'checking-excluded', type: 'checking', include_in_total: false }),
    ]
    const balances = { 'checking-active': 100000, 'checking-inactive': 999999, 'checking-excluded': 999999 }
    expect(sumEligibleCashAgorot(accounts, balances)).toBe(100000)
  })

  it('defaults a missing balance-map entry to 0 (account with no transactions yet)', () => {
    const accounts = [account({ id: 'checking-1' })]
    expect(sumEligibleCashAgorot(accounts, {})).toBe(0)
  })

  it('returns 0 for an empty account list', () => {
    expect(sumEligibleCashAgorot([], {})).toBe(0)
  })

  it('handles a negative eligible-account balance (overdrawn checking) correctly', () => {
    const accounts = [account({ id: 'checking-1' })]
    expect(sumEligibleCashAgorot(accounts, { 'checking-1': -15000 })).toBe(-15000)
  })
})
