import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { getCurrentBillingCycleRange } from '../lib/creditCardCycle'
import { useCreditCardCycleSpend } from './useCreditCardCycleSpend'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCreditCardCycleSpend', () => {
  it('returns null spend/range without querying supabase when billingCycleDay is null', async () => {
    const { result } = await renderHook(() => useCreditCardCycleSpend('acct-1', null), { wrapper })

    expect(result.current.spendAgorot).toBeNull()
    expect(result.current.range).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('does not query supabase when there is no account id', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useCreditCardCycleSpend(undefined, 15), { wrapper })

    expect(builder.select).not.toHaveBeenCalled()
  })

  it('scopes the query to the given account id, selecting only amount_agorot/txn_date/transfer_id', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useCreditCardCycleSpend('acct-1', 15), { wrapper })

    await waitFor(() => expect(builder.select).toHaveBeenCalledWith('amount_agorot, txn_date, transfer_id'))
    expect(builder.eq).toHaveBeenCalledWith('account_id', 'acct-1')
  })

  it('computes current-cycle spend from the fetched transactions, excluding a transaction outside the range and a transfer leg', async () => {
    // Derive a guaranteed-in-range date from the real function under test —
    // computeCurrentCycleSpendAgorot's own exhaustive boundary-case coverage
    // already lives in creditCardCycle.test.ts; this only proves the hook
    // wires the two pure functions together correctly, without depending on
    // whatever "today" happens to be when this test runs.
    const range = getCurrentBillingCycleRange(15, localDateString())

    jest.mocked(supabase.from).mockReturnValue(
      createQueryBuilderMock({
        data: [
          { amount_agorot: -12000, txn_date: range.start, transfer_id: null },
          { amount_agorot: -50000, txn_date: '2000-01-01', transfer_id: null },
          { amount_agorot: -30000, txn_date: range.start, transfer_id: 'transfer-1' },
        ],
        error: null,
      }) as unknown as ReturnType<typeof supabase.from>
    )

    const { result } = await renderHook(() => useCreditCardCycleSpend('acct-1', 15), { wrapper })

    await waitFor(() => expect(result.current.spendAgorot).toBe(12000))
    expect(result.current.range).toEqual(range)
  })
})
