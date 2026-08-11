import { describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { createQueryBuilderMock } from '@/lib/supabase/__mocks__/client'
import { useProfile } from './useProfile'

jest.mock('@/lib/supabase/client')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useProfile', () => {
  it('is null/not loading when there is no user id', async () => {
    const { result } = await renderHook(() => useProfile(undefined), { wrapper })
    expect(result.current.displayName).toBeNull()
    expect(result.current.avatarUrl).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('resolves display name and avatar url for the given user id', async () => {
    jest
      .mocked(supabase.from)
      .mockReturnValue(
        createQueryBuilderMock({
          data: { display_name: 'דנה כהן', avatar_url: null },
          error: null,
        }) as unknown as ReturnType<typeof supabase.from>
      )

    const { result } = await renderHook(() => useProfile('user-1'), { wrapper })
    await waitFor(() => expect(result.current.displayName).toBe('דנה כהן'))
    expect(result.current.avatarUrl).toBeNull()
  })

  it('scopes the query to the caller-supplied user id', async () => {
    const builder = createQueryBuilderMock({ data: { display_name: 'x', avatar_url: null }, error: null })
    jest.mocked(supabase.from).mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>)

    await renderHook(() => useProfile('user-42'), { wrapper })
    await waitFor(() => expect(builder.eq).toHaveBeenCalledWith('id', 'user-42'))
  })
})
