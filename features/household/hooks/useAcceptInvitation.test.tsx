import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAcceptInvitation } from './useAcceptInvitation'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { useHouseholdStore } from '@/store/householdStore'
import * as dispatcher from '@/lib/events/dispatcher'

jest.mock('@/lib/supabase/client')
jest.mock('@/features/auth/hooks/useAuth')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useAcceptInvitation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useHouseholdStore.setState({ householdId: null })
    jest
      .mocked(useAuth)
      .mockReturnValue({ session: null, user: { id: 'user-1' } as never, isLoading: false })
  })

  it('accepts successfully (already_member: false), stores the household id, and emits household.member_joined', async () => {
    const emitSpy = jest.spyOn(dispatcher, 'emit')
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_id: 'household-1', already_member: false },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useAcceptInvitation(), { wrapper })
    result.current.mutate('tok-abc')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.rpc).toHaveBeenCalledWith('accept_invitation', { p_token: 'tok-abc' })
    expect(useHouseholdStore.getState().householdId).toBe('household-1')
    expect(emitSpy).toHaveBeenCalledWith({
      type: 'household.member_joined',
      householdId: 'household-1',
      actorId: 'user-1',
      occurredAt: expect.any(String),
      payload: { memberId: 'user-1', invitationId: null },
    })
  })

  it('accepts idempotently (already_member: true): stores the household id but does not re-emit the event', async () => {
    const emitSpy = jest.spyOn(dispatcher, 'emit')
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_id: 'household-1', already_member: true },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useAcceptInvitation(), { wrapper })
    result.current.mutate('tok-abc')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(useHouseholdStore.getState().householdId).toBe('household-1')
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it('resolves already_in_household (accept while already in another household) without storing an id or emitting', async () => {
    const emitSpy = jest.spyOn(dispatcher, 'emit')
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: false, error: 'already_in_household' },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useAcceptInvitation(), { wrapper })
    result.current.mutate('tok-abc')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ ok: false, error: 'already_in_household' })
    expect(useHouseholdStore.getState().householdId).toBeNull()
    expect(emitSpy).not.toHaveBeenCalled()
  })

  it.each(['invalid_invitation'] as const)(
    'resolves %s the same generic way for invalid/expired/reused/revoked tokens (server does not distinguish)',
    async (errorCode) => {
      jest.mocked(supabase.rpc).mockResolvedValue({
        data: { ok: false, error: errorCode },
        error: null,
      } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

      const { result } = await renderHook(() => useAcceptInvitation(), { wrapper })
      result.current.mutate('dead-token')

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toEqual({ ok: false, error: errorCode })
      expect(useHouseholdStore.getState().householdId).toBeNull()
    }
  )

  it('invalidates the household-membership and household query keys on success', async () => {
    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function localWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: { ok: true, household_id: 'household-1', already_member: false },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useAcceptInvitation(), { wrapper: localWrapper })
    result.current.mutate('tok-abc')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth', 'household-membership', 'user-1'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['household', 'current', 'user-1'] })
  })

  it('surfaces a genuine transport failure as a mutation error', async () => {
    jest.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: new Error('network error'),
    } as unknown as Awaited<ReturnType<typeof supabase.rpc>>)

    const { result } = await renderHook(() => useAcceptInvitation(), { wrapper })
    result.current.mutate('tok-abc')

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
