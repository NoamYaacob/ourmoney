import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import * as SecureStore from 'expo-secure-store'
import type { ReactNode } from 'react'
import { usePendingInvitationToken } from './usePendingInvitationToken'
import { PENDING_INVITATION_TTL_MS } from '../lib/pendingInvitationToken'

jest.mock('expo-secure-store')

function stored(token: string, storedAt: number) {
  return JSON.stringify({ token, storedAt })
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('usePendingInvitationToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)
  })

  it('is null and not loading when disabled (no session yet)', async () => {
    const { result } = await renderHook(() => usePendingInvitationToken(false), { wrapper })
    expect(result.current.token).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled()
  })

  it('resolves null when nothing is stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)

    const { result } = await renderHook(() => usePendingInvitationToken(true), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.token).toBeNull()
  })

  it('resolves the stored token when one exists and is still within its TTL', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(stored('tok-123', Date.now()))

    const { result } = await renderHook(() => usePendingInvitationToken(true), { wrapper })
    await waitFor(() => expect(result.current.token).toBe('tok-123'))
  })

  it('resolves a persisted token on a fresh mount (cold start / remount)', async () => {
    // A fresh QueryClient (as a real cold start would create) still resolves
    // whatever SecureStore actually has on disk — the store is the source of
    // truth, not just the in-memory cache from a prior mount.
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(stored('persisted-tok', Date.now()))

    function freshWrapper({ children }: { children: ReactNode }) {
      const queryClient = createTestQueryClient()
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = await renderHook(() => usePendingInvitationToken(true), {
      wrapper: freshWrapper,
    })
    await waitFor(() => expect(result.current.token).toBe('persisted-tok'))
  })

  // Regression (adversarial review follow-up): bounds the window during
  // which a token stored by whoever tapped the link can be inherited by an
  // unrelated later authentication on a shared/never-used device.
  it('treats an expired token as absent and self-cleans it from SecureStore', async () => {
    const expiredAt = Date.now() - (PENDING_INVITATION_TTL_MS + 1_000)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(stored('stale-tok', expiredAt))

    const { result } = await renderHook(() => usePendingInvitationToken(true), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.token).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
  })

  it('still resolves a token stored just under the TTL boundary', async () => {
    const almostExpired = Date.now() - (PENDING_INVITATION_TTL_MS - 60_000)
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(stored('tok-abc', almostExpired))

    const { result } = await renderHook(() => usePendingInvitationToken(true), { wrapper })
    await waitFor(() => expect(result.current.token).toBe('tok-abc'))
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })

  it('treats malformed stored data as absent and self-cleans it', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('not-valid-json')

    const { result } = await renderHook(() => usePendingInvitationToken(true), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.token).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ourmoney.pendingInvitationToken')
  })
})
