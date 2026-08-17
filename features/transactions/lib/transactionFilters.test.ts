import { describe, expect, it } from '@jest/globals'
import {
  buildTransactionQueryFilters,
  DEFAULT_TRANSACTION_FILTER_STATE,
  filterTransactionsLocally,
  isDefaultTransactionFilterState,
  parseTransactionFilterParams,
  transactionFilterStateToParams,
  type TransactionFilterState,
} from './transactionFilters'
import type { Transaction } from '@/types/app'

function state(overrides: Partial<TransactionFilterState>): TransactionFilterState {
  return { ...DEFAULT_TRANSACTION_FILTER_STATE, ...overrides }
}

function txn(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'txn-1',
    household_id: 'household-1',
    account_id: 'acct-1',
    category_id: null,
    matched_rule_id: null,
    amount_agorot: -1000,
    description: 'תיאור',
    merchant_name: null,
    txn_date: '2026-08-01',
    is_shared: true,
    is_excluded: false,
    payer_id: null,
    note: null,
    source: 'manual',
    transfer_id: null,
    created_by: 'user-1',
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  } as Transaction
}

describe('isDefaultTransactionFilterState', () => {
  it('is true for the default state', () => {
    expect(isDefaultTransactionFilterState(DEFAULT_TRANSACTION_FILTER_STATE)).toBe(true)
  })

  it('is true when search is only whitespace', () => {
    expect(isDefaultTransactionFilterState(state({ search: '   ' }))).toBe(true)
  })

  it('is false when any single field is non-default', () => {
    expect(isDefaultTransactionFilterState(state({ search: 'קפה' }))).toBe(false)
    expect(isDefaultTransactionFilterState(state({ period: 'current_month' }))).toBe(false)
    expect(isDefaultTransactionFilterState(state({ accountId: 'acct-1' }))).toBe(false)
    expect(isDefaultTransactionFilterState(state({ categoryId: 'uncategorized' }))).toBe(false)
    expect(isDefaultTransactionFilterState(state({ type: 'expense' }))).toBe(false)
    expect(isDefaultTransactionFilterState(state({ shared: 'shared' }))).toBe(false)
  })
})

describe('buildTransactionQueryFilters', () => {
  const NOW = new Date(2026, 7, 16)

  it('produces no filters at all for the default state', () => {
    expect(buildTransactionQueryFilters(DEFAULT_TRANSACTION_FILTER_STATE, NOW)).toEqual({})
  })

  it('maps accountId through directly', () => {
    expect(buildTransactionQueryFilters(state({ accountId: 'acct-1' }), NOW)).toEqual({ accountId: 'acct-1' })
  })

  it('maps a specific categoryId through directly', () => {
    expect(buildTransactionQueryFilters(state({ categoryId: 'cat-1' }), NOW)).toEqual({ categoryId: 'cat-1' })
  })

  it('maps the uncategorized sentinel to the uncategorized flag, not categoryId', () => {
    expect(buildTransactionQueryFilters(state({ categoryId: 'uncategorized' }), NOW)).toEqual({ uncategorized: true })
  })

  it('maps a named period to periodStart/periodEnd', () => {
    expect(buildTransactionQueryFilters(state({ period: 'current_month' }), NOW)).toEqual({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
    })
  })

  it('all_time contributes no periodStart/periodEnd', () => {
    expect(buildTransactionQueryFilters(state({ period: 'all_time' }), NOW)).toEqual({})
  })

  it('maps shared to isShared: true', () => {
    expect(buildTransactionQueryFilters(state({ shared: 'shared' }), NOW)).toEqual({ isShared: true })
  })

  it('maps personal to isShared: false', () => {
    expect(buildTransactionQueryFilters(state({ shared: 'personal' }), NOW)).toEqual({ isShared: false })
  })

  it('composes every server-side dimension together', () => {
    const result = buildTransactionQueryFilters(
      state({ accountId: 'acct-1', categoryId: 'cat-1', period: 'current_month', shared: 'shared' }),
      NOW
    )
    expect(result).toEqual({
      accountId: 'acct-1',
      categoryId: 'cat-1',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      isShared: true,
    })
  })
})

describe('filterTransactionsLocally', () => {
  const categoryNameById = { 'cat-food': 'מזון', 'cat-fun': 'בילויים' }

  it('matches by description', () => {
    const transactions = [txn({ id: 't1', description: 'קניות בסופר' }), txn({ id: 't2', description: 'דלק' })]
    const result = filterTransactionsLocally(transactions, { search: 'סופר', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('matches by merchant name', () => {
    const transactions = [
      txn({ id: 't1', description: 'קניות', merchant_name: 'שופרסל' }),
      txn({ id: 't2', description: 'קניות', merchant_name: 'רמי לוי' }),
    ]
    const result = filterTransactionsLocally(transactions, { search: 'שופרסל', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('matches by category name', () => {
    const transactions = [
      txn({ id: 't1', description: 'קפה', category_id: 'cat-food' }),
      txn({ id: 't2', description: 'קפה', category_id: 'cat-fun' }),
    ]
    const result = filterTransactionsLocally(transactions, { search: 'מזון', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('is case-insensitive for Latin-script merchant names', () => {
    const transactions = [txn({ id: 't1', description: 'x', merchant_name: 'IKEA' })]
    const result = filterTransactionsLocally(transactions, { search: 'ikea', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('matches Hebrew text correctly regardless of nikud-free normal spelling', () => {
    const transactions = [
      txn({ id: 't1', description: 'תשלום עבור שכירות דירה' }),
      txn({ id: 't2', description: 'קניות בסופר' }),
    ]
    const result = filterTransactionsLocally(transactions, { search: 'שכירות', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('trims surrounding whitespace from the search query', () => {
    const transactions = [txn({ id: 't1', description: 'קפה' })]
    const result = filterTransactionsLocally(transactions, { search: '  קפה  ', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('returns everything when the search text is empty', () => {
    const transactions = [txn({ id: 't1' }), txn({ id: 't2' })]
    const result = filterTransactionsLocally(transactions, { search: '', type: 'all' }, categoryNameById)
    expect(result).toHaveLength(2)
  })

  it('filters to expenses only, by the signed amount convention (not category)', () => {
    const transactions = [
      txn({ id: 't1', amount_agorot: -1000 }),
      txn({ id: 't2', amount_agorot: 5000 }),
    ]
    const result = filterTransactionsLocally(transactions, { search: '', type: 'expense' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('filters to income only, by the signed amount convention', () => {
    const transactions = [
      txn({ id: 't1', amount_agorot: -1000 }),
      txn({ id: 't2', amount_agorot: 5000 }),
    ]
    const result = filterTransactionsLocally(transactions, { search: '', type: 'income' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t2'])
  })

  it('composes search and type together', () => {
    const transactions = [
      txn({ id: 't1', description: 'קפה', amount_agorot: -1000 }),
      txn({ id: 't2', description: 'קפה', amount_agorot: 5000 }),
      txn({ id: 't3', description: 'דלק', amount_agorot: -2000 }),
    ]
    const result = filterTransactionsLocally(transactions, { search: 'קפה', type: 'expense' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t1'])
  })

  it('filters to transfers only, by transfer_id (migration 008)', () => {
    const transactions = [
      txn({ id: 't1', amount_agorot: -5000, transfer_id: 'transfer-1' }),
      txn({ id: 't2', amount_agorot: 5000, transfer_id: 'transfer-1' }),
      txn({ id: 't3', amount_agorot: -1000 }),
    ]
    const result = filterTransactionsLocally(transactions, { search: '', type: 'transfer' }, categoryNameById)
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't2'])
  })

  it('excludes a transfer leg from the expense filter even though its amount is negative', () => {
    const transactions = [
      txn({ id: 't1', amount_agorot: -5000, transfer_id: 'transfer-1' }),
      txn({ id: 't2', amount_agorot: -1000 }),
    ]
    const result = filterTransactionsLocally(transactions, { search: '', type: 'expense' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t2'])
  })

  it('excludes a transfer leg from the income filter even though its amount is positive', () => {
    const transactions = [
      txn({ id: 't1', amount_agorot: 5000, transfer_id: 'transfer-1' }),
      txn({ id: 't2', amount_agorot: 1000 }),
    ]
    const result = filterTransactionsLocally(transactions, { search: '', type: 'income' }, categoryNameById)
    expect(result.map((t) => t.id)).toEqual(['t2'])
  })

  it('does not hide or treat excluded transactions specially — is_excluded plays no role in filtering', () => {
    const transactions = [
      txn({ id: 't1', description: 'קפה', is_excluded: true }),
      txn({ id: 't2', description: 'קפה', is_excluded: false }),
    ]
    const result = filterTransactionsLocally(transactions, { search: 'קפה', type: 'all' }, categoryNameById)
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't2'])
  })
})

describe('parseTransactionFilterParams / transactionFilterStateToParams round-trip', () => {
  it('parses an empty params object to the default state', () => {
    expect(parseTransactionFilterParams({})).toEqual(DEFAULT_TRANSACTION_FILTER_STATE)
  })

  it('round-trips a fully-specified state through params and back', () => {
    const original = state({
      search: 'סופר',
      period: 'last_3_months',
      accountId: 'acct-1',
      categoryId: 'uncategorized',
      type: 'income',
      shared: 'personal',
    })
    const params = transactionFilterStateToParams(original)
    expect(parseTransactionFilterParams(params)).toEqual(original)
  })

  it('treats an unrecognized period param as the default rather than throwing', () => {
    expect(parseTransactionFilterParams({ period: 'nonsense' }).period).toBe('all_time')
  })

  it('treats "all" accountId/categoryId params as null (no filter)', () => {
    const parsed = parseTransactionFilterParams({ accountId: 'all', categoryId: 'all' })
    expect(parsed.accountId).toBeNull()
    expect(parsed.categoryId).toBeNull()
  })
})
