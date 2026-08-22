import { describe, expect, it } from '@jest/globals'
import {
  buildUpcomingCommitments,
  type BuildUpcomingCommitmentsInput,
  type CommitmentCreditCardAccountInput,
  type CommitmentInstallmentTemplate,
  type CommitmentObligationInput,
  type CommitmentRecurringTemplate,
} from './buildUpcomingCommitments'

const TODAY = '2026-08-16'
const HORIZON_END = '2026-09-14' // today + 30 days - 1

function baseInput(overrides: Partial<BuildUpcomingCommitmentsInput> = {}): BuildUpcomingCommitmentsInput {
  return {
    today: TODAY,
    horizonEnd: HORIZON_END,
    obligations: [],
    recurringTemplates: [],
    installmentPlans: [],
    creditCardAccounts: [],
    ...overrides,
  }
}

function obligation(overrides: Partial<CommitmentObligationInput> = {}): CommitmentObligationInput {
  return {
    id: 'ob-1',
    name: 'ארנונה',
    amountAgorot: 50000,
    dueDate: '2026-08-25',
    status: 'upcoming',
    categoryId: null,
    accountId: null,
    isShared: true,
    ...overrides,
  }
}

function recurringTemplate(overrides: Partial<CommitmentRecurringTemplate> = {}): CommitmentRecurringTemplate {
  return {
    id: 'rec-1',
    description: 'נטפליקס',
    amountAgorot: -5000,
    frequency: 'monthly',
    dayOfMonth: 20,
    nextDueDate: '2026-08-20',
    isActive: true,
    categoryId: null,
    accountId: null,
    isShared: false,
    ...overrides,
  }
}

function installmentPlan(overrides: Partial<CommitmentInstallmentTemplate> = {}): CommitmentInstallmentTemplate {
  return {
    id: 'inst-1',
    description: 'מקרר',
    totalAgorot: 300000,
    installmentCount: 3,
    monthlyAgorot: 100000,
    firstChargeDate: '2026-08-01',
    materializedCount: 1,
    categoryId: null,
    accountId: null,
    isShared: true,
    ...overrides,
  }
}

function creditCardAccount(
  overrides: Partial<CommitmentCreditCardAccountInput> = {}
): CommitmentCreditCardAccountInput {
  return {
    accountId: 'acc-cc-1',
    accountName: 'ויזה',
    billingCycleDay: 10,
    transactions: [],
    ...overrides,
  }
}

describe('buildUpcomingCommitments', () => {
  it('returns nothing when every source is empty', () => {
    expect(buildUpcomingCommitments(baseInput())).toEqual([])
  })

  it('includes an upcoming obligation within the horizon', () => {
    const items = buildUpcomingCommitments(baseInput({ obligations: [obligation()] }))
    expect(items).toHaveLength(1)
    expect(items[0]?.source).toBe('obligation')
    expect(items[0]?.amountAgorot).toBe(50000)
    expect(items[0]?.sharedAgorot).toBe(50000)
    expect(items[0]?.personalAgorot).toBe(0)
  })

  it('excludes an obligation due beyond the horizon', () => {
    const items = buildUpcomingCommitments(baseInput({ obligations: [obligation({ dueDate: '2026-12-01' })] }))
    expect(items).toEqual([])
  })

  it('excludes a completed or cancelled obligation', () => {
    const items = buildUpcomingCommitments(
      baseInput({ obligations: [obligation({ status: 'completed' }), obligation({ id: 'ob-2', status: 'cancelled' })] })
    )
    expect(items).toEqual([])
  })

  it('includes an overdue-but-unpaid obligation (still a real claim on cash)', () => {
    const items = buildUpcomingCommitments(baseInput({ obligations: [obligation({ dueDate: '2026-08-01' })] }))
    expect(items).toHaveLength(1)
  })

  it('splits a personal obligation entirely into personalAgorot', () => {
    const items = buildUpcomingCommitments(baseInput({ obligations: [obligation({ isShared: false })] }))
    expect(items[0]?.sharedAgorot).toBe(0)
    expect(items[0]?.personalAgorot).toBe(50000)
  })

  it('forecasts recurring expense occurrences within the horizon, as a positive magnitude', () => {
    const items = buildUpcomingCommitments(baseInput({ recurringTemplates: [recurringTemplate()] }))
    expect(items).toHaveLength(1)
    expect(items[0]?.source).toBe('recurring')
    expect(items[0]?.amountAgorot).toBe(5000)
    expect(items[0]?.sharedAgorot).toBe(0)
    expect(items[0]?.personalAgorot).toBe(5000)
  })

  it('excludes a recurring INCOME occurrence (not a commitment to spend)', () => {
    const items = buildUpcomingCommitments(
      baseInput({ recurringTemplates: [recurringTemplate({ id: 'rec-income', amountAgorot: 500000 })] })
    )
    expect(items).toEqual([])
  })

  it('forecasts every recurring occurrence inside the horizon, not just the first', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        recurringTemplates: [recurringTemplate({ frequency: 'weekly', dayOfMonth: null, nextDueDate: '2026-08-16' })],
      })
    )
    expect(items.filter((i) => i.source === 'recurring').length).toBeGreaterThan(1)
  })

  it('forecasts installment occurrences, resuming from materializedCount', () => {
    const items = buildUpcomingCommitments(baseInput({ installmentPlans: [installmentPlan()] }))
    // materializedCount 1 of 3 -> occurrence 2 (2026-09-01) is the next one
    // and falls within the horizon; occurrence 3 (2026-10-01) does not.
    expect(items.filter((i) => i.source === 'installment')).toHaveLength(1)
    expect(items.find((i) => i.source === 'installment')?.amountAgorot).toBe(100000)
  })

  it('absorbs the floor-division remainder on the final installment occurrence', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        horizonEnd: '2026-12-31',
        installmentPlans: [installmentPlan({ totalAgorot: 300001, materializedCount: 1 })],
      })
    )
    const installmentItems = items.filter((i) => i.source === 'installment')
    expect(installmentItems).toHaveLength(2)
    // monthlyAgorot stays 100000 for the middle occurrence; the last
    // absorbs the 1-agorot remainder: 300001 - 100000*2 = 100001.
    expect(installmentItems.map((i) => i.amountAgorot)).toEqual([100000, 100001])
  })

  it('splits a shared installment entirely into sharedAgorot', () => {
    const items = buildUpcomingCommitments(baseInput({ installmentPlans: [installmentPlan({ isShared: true })] }))
    for (const item of items) {
      expect(item.personalAgorot).toBe(0)
      expect(item.sharedAgorot).toBe(item.amountAgorot)
    }
  })

  it('includes a credit card current-cycle line item when there is spend', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        creditCardAccounts: [
          creditCardAccount({
            transactions: [
              { amount_agorot: -20000, txn_date: '2026-08-12', transfer_id: null, is_excluded: false, isShared: true },
              { amount_agorot: -10000, txn_date: '2026-08-13', transfer_id: null, is_excluded: false, isShared: false },
            ],
          }),
        ],
      })
    )
    const cardItem = items.find((i) => i.source === 'credit_card_cycle')
    expect(cardItem).toBeDefined()
    expect(cardItem?.amountAgorot).toBe(30000)
    expect(cardItem?.sharedAgorot).toBe(20000)
    expect(cardItem?.personalAgorot).toBe(10000)
  })

  it('omits a credit card with zero current-cycle spend', () => {
    const items = buildUpcomingCommitments(baseInput({ creditCardAccounts: [creditCardAccount({ transactions: [] })] }))
    expect(items.filter((i) => i.source === 'credit_card_cycle')).toEqual([])
  })

  it('excludes a household-excluded transaction (e.g. a reimbursed purchase) from the credit card cycle total and its shared/personal split', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        creditCardAccounts: [
          creditCardAccount({
            transactions: [
              { amount_agorot: -20000, txn_date: '2026-08-12', transfer_id: null, is_excluded: false, isShared: true },
              { amount_agorot: -30000, txn_date: '2026-08-13', transfer_id: null, is_excluded: true, isShared: true },
            ],
          }),
        ],
      })
    )
    const cardItem = items.find((i) => i.source === 'credit_card_cycle')
    expect(cardItem?.amountAgorot).toBe(20000)
    expect(cardItem?.sharedAgorot).toBe(20000)
  })

  it('excludes a statement-payment transfer leg from the credit card cycle total', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        creditCardAccounts: [
          creditCardAccount({
            transactions: [
              { amount_agorot: -20000, txn_date: '2026-08-12', transfer_id: null, is_excluded: false, isShared: true },
              { amount_agorot: 50000, txn_date: '2026-08-13', transfer_id: 'transfer-1', is_excluded: false, isShared: true },
            ],
          }),
        ],
      })
    )
    const cardItem = items.find((i) => i.source === 'credit_card_cycle')
    expect(cardItem?.amountAgorot).toBe(20000)
  })

  it('combines all four sources into one date-sorted list', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        obligations: [obligation({ dueDate: '2026-09-01' })],
        recurringTemplates: [recurringTemplate({ nextDueDate: '2026-08-20' })],
        installmentPlans: [installmentPlan()],
        creditCardAccounts: [
          creditCardAccount({
            transactions: [{ amount_agorot: -10000, txn_date: '2026-08-12', transfer_id: null, is_excluded: false, isShared: true }],
          }),
        ],
      })
    )
    const dates = items.map((i) => i.date)
    expect(dates).toEqual([...dates].sort())
    expect(new Set(items.map((i) => i.source))).toEqual(
      new Set(['obligation', 'recurring', 'installment', 'credit_card_cycle'])
    )
  })

  it('every item satisfies sharedAgorot + personalAgorot === amountAgorot', () => {
    const items = buildUpcomingCommitments(
      baseInput({
        obligations: [obligation({ isShared: false })],
        recurringTemplates: [recurringTemplate({ isShared: true })],
        installmentPlans: [installmentPlan({ isShared: false })],
        creditCardAccounts: [
          creditCardAccount({
            transactions: [
              { amount_agorot: -20000, txn_date: '2026-08-12', transfer_id: null, is_excluded: false, isShared: true },
              { amount_agorot: -10000, txn_date: '2026-08-13', transfer_id: null, is_excluded: false, isShared: false },
            ],
          }),
        ],
      })
    )
    for (const item of items) {
      expect(item.sharedAgorot + item.personalAgorot).toBe(item.amountAgorot)
    }
  })

  it('produces deterministic ids: same input twice produces identical, non-colliding ids', () => {
    const input = baseInput({
      obligations: [obligation()],
      recurringTemplates: [recurringTemplate()],
      installmentPlans: [installmentPlan()],
    })
    const first = buildUpcomingCommitments(input).map((i) => i.id)
    const second = buildUpcomingCommitments(input).map((i) => i.id)
    expect(first).toEqual(second)
    expect(new Set(first).size).toBe(first.length)
  })
})
