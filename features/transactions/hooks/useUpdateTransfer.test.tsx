import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useUpdateTransfer } from './useUpdateTransfer'

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
  transferId: 'transfer-1',
  householdId: 'household-1',
  fromAccountId: 'acct-checking',
  toAccountId: 'acct-savings',
  amountAgorot: 70000,
  txnDate: '2026-08-15',
  description: 'עדכון סכום ההעברה',
}

describe('useUpdateTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls update_transfer with every field on every call — no partial-update form', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('update_transfer', {
      p_transfer_id: 'transfer-1',
      p_from_account_id: 'acct-checking',
      p_to_account_id: 'acct-savings',
      p_amount_agorot: 70000,
      p_txn_date: '2026-08-15',
      p_description: 'עדכון סכום ההעברה',
    })
  })

  it('emits transfer.updated after a successful call', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transfer.updated',
        payload: expect.objectContaining({ transferId: 'transfer-1', amountAgorot: 70000 }),
      })
    )
  })

  it('surfaces an ok:false RPC result (e.g. not_found on a delete-during-edit race) as a thrown error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'not_found' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useUpdateTransfer('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'not_found' }))
    expect(emit).not.toHaveBeenCalled()
  })
})
