import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useCreateTransfer } from './useCreateTransfer'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

const INPUT = {
  householdId: 'household-1',
  fromAccountId: 'acct-checking',
  toAccountId: 'acct-savings',
  amountAgorot: 50000,
  txnDate: '2026-08-15',
  description: 'העברה לחיסכון',
}

describe('useCreateTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls create_transfer with the RPC argument names the migration expects', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, transfer_id: 'transfer-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('create_transfer', {
      p_from_account_id: 'acct-checking',
      p_to_account_id: 'acct-savings',
      p_amount_agorot: 50000,
      p_txn_date: '2026-08-15',
      p_description: 'העברה לחיסכון',
    })
  })

  it('resolves with the new transfer id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, transfer_id: 'transfer-42' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.data).toBe('transfer-42'))
  })

  it('emits transfer.created, not transaction.created, after a successful call', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, transfer_id: 'transfer-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer.created',
        householdId: 'household-1',
        payload: expect.objectContaining({
          transferId: 'transfer-1',
          fromAccountId: 'acct-checking',
          toAccountId: 'acct-savings',
          amountAgorot: 50000,
        }),
      })
    )
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'transaction.created' }))
  })

  it('surfaces an ok:false RPC result as a thrown error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'invalid_account' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'invalid_account' }))
    expect(emit).not.toHaveBeenCalled()
  })

  it('surfaces a transport-level error without emitting anything', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCreateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(emit).not.toHaveBeenCalled()
  })
})
