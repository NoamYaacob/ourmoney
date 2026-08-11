import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useSignUp } from './useSignUp'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useSignUp', () => {
  it('calls supabase.auth.signUp with the display name in user metadata', async () => {
    jest.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signUp>>)

    const { result } = await renderHook(() => useSignUp(), { wrapper })
    result.current.mutate({ email: 'a@b.com', password: 'password123', displayName: 'Noam' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
      options: { data: { display_name: 'Noam' } },
    })
  })

  it('surfaces a failure via mutation error state (e.g. sign-up failed)', async () => {
    jest.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('email already registered'),
    } as unknown as Awaited<ReturnType<typeof supabase.auth.signUp>>)

    const { result } = await renderHook(() => useSignUp(), { wrapper })
    result.current.mutate({ email: 'a@b.com', password: 'password123', displayName: 'Noam' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
