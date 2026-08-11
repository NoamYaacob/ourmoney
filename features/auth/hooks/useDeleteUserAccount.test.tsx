import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import * as SecureStore from 'expo-secure-store'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useDeleteUserAccount } from './useDeleteUserAccount'
import { useHouseholdStore } from '@/store/householdStore'

jest.mock('@/lib/supabase/client')
jest.mock('expo-secure-store')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useDeleteUserAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useHouseholdStore.setState({ householdId: null })
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signOut>>)
  })

  it('calls the delete_own_account RPC with no arguments', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('delete_own_account')
  })

  it('resolves household_deleted/new_admin_id from the RPC result', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: true, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: true, household_deleted: true, new_admin_id: null })
  })

  // A departed admin's succession outcome must reach the caller — not
  // consumed by the UI today, but the hook must not silently drop it.
  it('resolves a new_admin_id when the RPC reports an admin-succession promotion', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: 'user-b' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.new_admin_id).toBe('user-b')
  })

  it('clears household-scoped cache, the pending invitation token, and signs out on success', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    useHouseholdStore.setState({ householdId: 'household-1' })

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useHouseholdStore.getState().householdId).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('surfaces the RPC-level ok:false error and does not sign out', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'unauthenticated' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'unauthenticated' }))
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('surfaces a transport-level RPC error and does not sign out', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  // Regression (qa-adversarial-reviewer, Milestone 9): the account is
  // already deleted server-side by the time onSuccess runs — a signOut()
  // that rejects (e.g. a dropped connection) must never flip the mutation
  // to isError, which would tell the user their deletion failed when it
  // actually succeeded.
  it('still reports success when signOut() rejects after a successful deletion', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    jest.mocked(supabase.auth.signOut).mockRejectedValue(new Error('network error'))

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
  })

  it('does not clear the pending invitation token query key on failure', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'unauthenticated' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useDeleteUserAccount(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })
})
