import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useRemoveHouseholdMember } from './useRemoveHouseholdMember'
import { householdMembersQueryKey } from './useHouseholdMembers'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useRemoveHouseholdMember', () => {
  it('deletes the household_members row scoped by household id + user id (admin removing a member)', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useRemoveHouseholdMember('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'member-2' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.from).toHaveBeenCalledWith('household_members')
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('household_id', 'household-1')
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'member-2')
  })

  it('is the same hook used for a member leaving (self-targeted delete)', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useRemoveHouseholdMember('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'self-user' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'self-user')
  })

  it('invalidates the household members list on success', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const queryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')
    function sharedWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = await renderHook(() => useRemoveHouseholdMember('household-1'), { wrapper: sharedWrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'member-2' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: householdMembersQueryKey('household-1') })
  })

  it('surfaces a genuine RLS/transport failure as a mutation error', async () => {
    const builder = createQueryBuilderMock({ data: null, error: new Error('not admin') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useRemoveHouseholdMember('household-1'), { wrapper })
    result.current.mutate({ householdId: 'household-1', userId: 'member-2' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
