import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { emit } from '@/lib/events/dispatcher'
import { ConcurrencyError } from '@/lib/mutations/concurrencyError'
import { useCompletePlannedObligationWithTransaction } from './useCompletePlannedObligationWithTransaction'

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
  id: 'ob-1',
  expectedVersion: 1,
  accountId: 'acct-1',
  categoryId: 'cat-1',
  amountAgorot: 185000,
  isShared: true,
}

describe('useCompletePlannedObligationWithTransaction', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls complete_planned_obligation with p_create_transaction:true and the account id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 2, transaction_id: 'txn-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCompletePlannedObligationWithTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('complete_planned_obligation', {
      p_id: 'ob-1',
      p_expected_version: 1,
      p_create_transaction: true,
      p_account_id: 'acct-1',
    })
    expect(result.current.data).toEqual({ version: 2, transactionId: 'txn-1' })
  })

  it('emits transaction.created with the negated (expense) amount and the new transaction id', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, version: 2, transaction_id: 'txn-1' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCompletePlannedObligationWithTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transaction.created',
        householdId: 'household-1',
        actorId: 'user-1',
        payload: expect.objectContaining({
          transactionId: 'txn-1',
          accountId: 'acct-1',
          categoryId: 'cat-1',
          amountAgorot: -185000,
          isShared: true,
        }),
      })
    )
  })

  it('throws a ConcurrencyError(conflict) on a stale expected_version, and does not emit', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'conflict' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCompletePlannedObligationWithTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toBeInstanceOf(ConcurrencyError)
    expect((result.current.error as ConcurrencyError).kind).toBe('conflict')
    expect(emit).not.toHaveBeenCalled()
  })

  it('throws a plain Error(invalid_account) when the RPC rejects the account, and does not emit', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'invalid_account' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useCompletePlannedObligationWithTransaction('household-1'), { wrapper })
    result.current.mutate(INPUT)

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).not.toBeInstanceOf(ConcurrencyError)
    expect((result.current.error as Error).message).toBe('invalid_account')
    expect(emit).not.toHaveBeenCalled()
  })
})
