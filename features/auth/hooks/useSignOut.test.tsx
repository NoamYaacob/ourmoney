import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useSignOut } from './useSignOut'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useSignOut', () => {
  it('calls supabase.auth.signOut', async () => {
    jest.mocked(supabase.auth.signOut).mockResolvedValue({
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.signOut>>)

    const { result } = await renderHook(() => useSignOut(), { wrapper })
    result.current.mutate()

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })
})
