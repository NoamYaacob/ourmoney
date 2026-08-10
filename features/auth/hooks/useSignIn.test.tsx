import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useSignIn } from './useSignIn'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useSignIn', () => {
  it('calls supabase.auth.signInWithPassword with the given credentials', async () => {
    jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>)

    const { result } = await renderHook(() => useSignIn(), { wrapper })
    result.current.mutate({ email: 'a@b.com', password: 'password123' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'password123',
    })
  })

  it('surfaces failed credentials via mutation error state', async () => {
    jest.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: new Error('invalid credentials'),
    } as unknown as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>)

    const { result } = await renderHook(() => useSignIn(), { wrapper })
    result.current.mutate({ email: 'a@b.com', password: 'wrong-password' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
