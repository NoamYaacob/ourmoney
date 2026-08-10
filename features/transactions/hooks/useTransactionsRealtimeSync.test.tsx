import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTransactionsRealtimeSync } from './useTransactionsRealtimeSync'

jest.mock('@/lib/supabase/client')

interface MockChannel {
  on: jest.Mock
  subscribe: jest.Mock
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function latestChannel(): MockChannel {
  const results = jest.mocked(supabase.channel).mock.results
  return results[results.length - 1]?.value as MockChannel
}

describe('useTransactionsRealtimeSync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not subscribe when householdId is null', async () => {
    await renderHook(() => useTransactionsRealtimeSync(null), { wrapper })
    expect(supabase.channel).not.toHaveBeenCalled()
  })

  it('subscribes exactly once to a household-scoped channel', async () => {
    await renderHook(() => useTransactionsRealtimeSync('household-1'), { wrapper })
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(supabase.channel).toHaveBeenCalledWith('transactions:household:household-1')
  })

  it('filters postgres_changes to the given household and listens to every event type', async () => {
    await renderHook(() => useTransactionsRealtimeSync('household-1'), { wrapper })
    const channelInstance = latestChannel()
    expect(channelInstance.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        table: 'transactions',
        filter: 'household_id=eq.household-1',
      }),
      expect.any(Function)
    )
    expect(channelInstance.subscribe).toHaveBeenCalledTimes(1)
  })

  it('invalidates both the transactions and budget-progress prefixes on any change (invalidate, never merge)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    await renderHook(() => useTransactionsRealtimeSync('household-1'), { wrapper: localWrapper })
    const channelInstance = latestChannel()
    const onChangeHandler = channelInstance.on.mock.calls[0]?.[2] as (() => void) | undefined

    onChangeHandler?.()

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['transactions', 'household-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['budgets', 'progress', 'household-1'] })
  })

  it('tears down the channel on unmount', async () => {
    const { unmount } = await renderHook(() => useTransactionsRealtimeSync('household-1'), { wrapper })
    const channelInstance = latestChannel()
    await unmount()
    expect(supabase.removeChannel).toHaveBeenCalledWith(channelInstance)
  })

  it('re-subscribes on a householdId change (covers account switch) and tears down the old channel', async () => {
    const { rerender } = await renderHook(
      ({ householdId }: { householdId: string }) => useTransactionsRealtimeSync(householdId),
      { wrapper, initialProps: { householdId: 'household-A' } }
    )
    expect(supabase.channel).toHaveBeenCalledWith('transactions:household:household-A')

    await rerender({ householdId: 'household-B' })

    expect(supabase.removeChannel).toHaveBeenCalledTimes(1)
    expect(supabase.channel).toHaveBeenCalledWith('transactions:household:household-B')
  })
})
