// Milestone A: fetchFreshTransactionsForAccount is the CSV import commit-time
// duplicate re-check's data source — a direct, uncached Supabase read, not
// a TanStack Query hook. Covers only that new function; useTransactions
// itself (the query hook) already has indirect coverage through the
// screens that use it.

import { describe, expect, it, jest } from '@jest/globals'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { fetchFreshTransactionsForAccount } from './useTransactions'

jest.mock('@/lib/supabase/client')

describe('fetchFreshTransactionsForAccount', () => {
  it('queries transactions scoped to the household and account, selecting only the dedup-relevant columns', async () => {
    const rows = [{ account_id: 'acct-1', txn_date: '2026-01-15', amount_agorot: -2000, description: 'קפה' }]
    const builder = createQueryBuilderMock({ data: rows, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const result = await fetchFreshTransactionsForAccount('household-1', 'acct-1')

    expect(supabase.from).toHaveBeenCalledWith('transactions')
    expect(builder.select).toHaveBeenCalledWith('account_id, txn_date, amount_agorot, description')
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
    expect(builder.eq).toHaveBeenCalledWith('account_id', 'acct-1')
    expect(result).toEqual(rows)
  })

  it('returns an empty array when the query resolves with no data', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const result = await fetchFreshTransactionsForAccount('household-1', 'acct-1')
    expect(result).toEqual([])
  })

  it('throws on a Supabase error rather than silently returning an empty/partial snapshot', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('network error') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await expect(fetchFreshTransactionsForAccount('household-1', 'acct-1')).rejects.toThrow('network error')
  })
})
