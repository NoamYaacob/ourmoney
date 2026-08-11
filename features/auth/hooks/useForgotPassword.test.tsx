import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useForgotPassword } from './useForgotPassword'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useForgotPassword', () => {
  it('initiates a password reset with the deep-link redirect target', async () => {
    jest.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({
      data: {},
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.resetPasswordForEmail>>)

    const { result } = await renderHook(() => useForgotPassword(), { wrapper })
    result.current.mutate('a@b.com')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
      redirectTo: 'ourmoney://reset-password',
    })
  })
})
