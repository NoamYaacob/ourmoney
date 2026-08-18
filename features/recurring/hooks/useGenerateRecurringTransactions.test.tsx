// Regression coverage added alongside removing the unsafe `supabase.rpc`
// type-cast wrapper this hook used to carry (the cast's own justifying
// comment — "types/database.ts doesn't know this RPC name yet" — was
// factually false; the generated Functions union already types
// generate_recurring_transactions). This proves the call now compiles and
// behaves correctly against the REAL generated types, with no cast standing
// between the mutation and Supabase's own typed `rpc()` overload.
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useGenerateRecurringTransactions } from './useGenerateRecurringTransactions'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useGenerateRecurringTransactions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls the generate_recurring_transactions RPC with no arguments on mount', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, results: [] },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useGenerateRecurringTransactions('household-1'), { wrapper })

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('generate_recurring_transactions'))
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('does not call the RPC when there is no household', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, results: [] },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    renderHook(() => useGenerateRecurringTransactions(null), { wrapper })

    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('surfaces the RPC-level ok:false error via the hook error state', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'unauthenticated' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useGenerateRecurringTransactions('household-1'), { wrapper })

    await waitFor(() => expect(result.current.error).toEqual(expect.objectContaining({ message: 'unauthenticated' })))
  })

  it('surfaces a transport-level RPC error via the hook error state', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useGenerateRecurringTransactions('household-1'), { wrapper })

    await waitFor(() => expect(result.current.error).toBeTruthy())
  })

  it('does not call the RPC again while a call is already pending', async () => {
    let resolveRpc: (value: { data: unknown; error: null }) => void = () => {}
    jest.mocked(supabase.rpc).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRpc = resolve
      }) as unknown as ReturnType<typeof supabase.rpc>
    )

    const { result } = await renderHook(() => useGenerateRecurringTransactions('household-1'), { wrapper })
    // The mount effect already triggered one in-flight call; a second
    // explicit call while it's pending must be a no-op, not a second RPC.
    result.current.generate()

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    resolveRpc({ data: { ok: true, results: [] }, error: null })
  })
})
