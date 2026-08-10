import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase/client'
import { useRecoverySession } from './useRecoverySession'

jest.mock('@/lib/supabase/client')
jest.mock('expo-linking')

describe('useRecoverySession', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(Linking.addEventListener).mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof Linking.addEventListener
    >)
  })

  it('establishes a session from tokens in the deep link fragment (implicit flow)', async () => {
    jest
      .mocked(Linking.getInitialURL)
      .mockResolvedValue('ourmoney://reset-password#access_token=abc&refresh_token=def&type=recovery')
    jest.mocked(supabase.auth.setSession).mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.setSession>>)

    const { result } = await renderHook(() => useRecoverySession())

    await waitFor(() => expect(result.current).toBe('ready'))
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'abc',
      refresh_token: 'def',
    })
  })

  it('reports an error when the deep link has no recovery tokens', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue('ourmoney://reset-password')

    const { result } = await renderHook(() => useRecoverySession())

    await waitFor(() => expect(result.current).toBe('error'))
    expect(supabase.auth.setSession).not.toHaveBeenCalled()
  })

  it('reports an error when there is no initial URL at all', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(null)

    const { result } = await renderHook(() => useRecoverySession())

    await waitFor(() => expect(result.current).toBe('error'))
  })

  it('reports an error when setSession itself fails (e.g. an expired link)', async () => {
    jest
      .mocked(Linking.getInitialURL)
      .mockResolvedValue('ourmoney://reset-password#access_token=abc&refresh_token=def&type=recovery')
    jest.mocked(supabase.auth.setSession).mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('invalid token'),
    } as unknown as Awaited<ReturnType<typeof supabase.auth.setSession>>)

    const { result } = await renderHook(() => useRecoverySession())

    await waitFor(() => expect(result.current).toBe('error'))
  })

  it('also handles a warm-start deep link delivered via the url event', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(null)
    jest.mocked(supabase.auth.setSession).mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    } as unknown as Awaited<ReturnType<typeof supabase.auth.setSession>>)

    let urlHandler: ((event: { url: string }) => void) | undefined
    jest.mocked(Linking.addEventListener).mockImplementation((_type, handler) => {
      urlHandler = handler
      return { remove: jest.fn() } as unknown as ReturnType<typeof Linking.addEventListener>
    })

    const { result } = await renderHook(() => useRecoverySession())
    await waitFor(() => expect(result.current).toBe('error'))

    urlHandler?.({ url: 'ourmoney://reset-password#access_token=abc&refresh_token=def&type=recovery' })

    await waitFor(() => expect(result.current).toBe('ready'))
  })
})
