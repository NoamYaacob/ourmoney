import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { useDeleteTransfer } from './useDeleteTransfer'

jest.mock('@/lib/supabase/client')
jest.mock('@/lib/events/dispatcher')
jest.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useDeleteTransfer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls delete_transfer with the transfer id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteTransfer('household-1'), { wrapper })
    result.current.mutate('transfer-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('delete_transfer', { p_transfer_id: 'transfer-1' })
  })

  it('emits transfer.deleted after a successful call', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteTransfer('household-1'), { wrapper })
    result.current.mutate('transfer-1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transfer.deleted', payload: { transferId: 'transfer-1' } })
    )
  })

  it('surfaces an ok:false RPC result (e.g. not_admin) as a thrown error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'not_admin' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteTransfer('household-1'), { wrapper })
    result.current.mutate('transfer-1')

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'not_admin' }))
    expect(emit).not.toHaveBeenCalled()
  })
})
