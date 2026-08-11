import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useResetPassword } from './useResetPassword'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useResetPassword', () => {
  it('completes the reset by updating the user password', async () => {
    jest.mocked(supabase.auth.updateUser).mockResolvedValue({
      data: { user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.updateUser>>)

    const { result } = await renderHook(() => useResetPassword(), { wrapper })
    result.current.mutate('new-password-123')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-123' })
  })
})
