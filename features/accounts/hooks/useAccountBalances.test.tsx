import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useAccountBalances } from './useAccountBalances'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useAccountBalances', () => {
  it('is empty/not loading when there is no household id', async () => {
    const { result } = await renderHook(() => useAccountBalances(undefined), { wrapper })
    expect(result.current.balances).toEqual({})
    expect(result.current.isLoading).toBe(false)
  })

  it('reduces fetched transactions into a per-account balance record', async () => {
    jest.mocked(supabase.from).mockReturnValue(
      createQueryBuilderMock({
        data: [
          { account_id: 'acct-1', amount_agorot: 10000 },
          { account_id: 'acct-1', amount_agorot: -2500 },
          { account_id: 'acct-2', amount_agorot: 5000 },
        ],
        error: null,
      }) as unknown as ReturnType<typeof supabase.from>
    )

    const { result } = await renderHook(() => useAccountBalances('household-1'), { wrapper })
    await waitFor(() => expect(result.current.balances).toEqual({ 'acct-1': 7500, 'acct-2': 5000 }))
  })

  it('selects only account_id and amount_agorot, and scopes to the given household', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useAccountBalances('household-1'), { wrapper })
    await waitFor(() => expect(builder.select).toHaveBeenCalledWith('account_id, amount_agorot'))
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
  })
})
