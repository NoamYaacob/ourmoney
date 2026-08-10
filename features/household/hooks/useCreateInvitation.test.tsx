import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useCreateInvitation } from './useCreateInvitation'
import { useAuth } from '@/features/auth/hooks/useAuth'

jest.mock('@/lib/supabase/client')
jest.mock('@/features/auth/hooks/useAuth')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useCreateInvitation', () => {
  it('inserts an invitation scoped to the household, with invited_by from the caller session, and no client-supplied token', async () => {
    jest
      .mocked(useAuth)
      .mockReturnValue({ session: null, user: { id: 'user-1' } as never, isLoading: false })
    const builder = createQueryBuilderMock({ data: { token: 'generated-token' }, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useCreateInvitation('household-1'), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe('generated-token')
    expect(supabase.from).toHaveBeenCalledWith('invitations')
    expect(builder.insert).toHaveBeenCalledWith({ household_id: 'household-1', invited_by: 'user-1' })
    // The insert payload must never include a token — the database's
    // DEFAULT encode(gen_random_bytes(32), 'hex') is the only generator.
    const insertPayload = jest.mocked(builder.insert).mock.calls[0]?.[0] as Record<string, unknown>
    expect(insertPayload).not.toHaveProperty('token')
  })

  it('surfaces a genuine RLS/transport failure as a mutation error', async () => {
    jest
      .mocked(useAuth)
      .mockReturnValue({ session: null, user: { id: 'user-1' } as never, isLoading: false })
    const builder = createQueryBuilderMock({ data: null, error: new Error('not admin') })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    const { result } = await renderHook(() => useCreateInvitation('household-1'), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
