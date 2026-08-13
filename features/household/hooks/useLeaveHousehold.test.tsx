import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useLeaveHousehold } from './useLeaveHousehold'
import { useHouseholdStore } from '@/store/householdStore'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useLeaveHousehold', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useHouseholdStore.setState({ householdId: null })
  })

  it('calls the leave_household RPC with no arguments', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('leave_household')
  })

  it('resolves household_deleted/new_admin_id from the RPC result', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: true, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: true, household_deleted: true, new_admin_id: null })
  })

  // An admin leaving a multi-member household's succession outcome must
  // reach the caller — not consumed by the UI today, but the hook must not
  // silently drop it (same posture as useDeleteUserAccount's equivalent).
  it('resolves a new_admin_id when the RPC reports an admin-succession promotion', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: 'user-b' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.new_admin_id).toBe('user-b')
  })

  it('clears household-scoped cache/store on success', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_deleted: false, new_admin_id: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    useHouseholdStore.setState({ householdId: 'household-1' })

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useHouseholdStore.getState().householdId).toBeNull()
  })

  it('surfaces the RPC-level ok:false error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'not_a_member' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toEqual(expect.objectContaining({ message: 'not_a_member' }))
  })

  it('surfaces a transport-level RPC error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('does not clear household-scoped cache/store on failure', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'not_a_member' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)
    useHouseholdStore.setState({ householdId: 'household-1' })

    const { result } = await renderHook(() => useLeaveHousehold(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(useHouseholdStore.getState().householdId).toBe('household-1')
  })
})
