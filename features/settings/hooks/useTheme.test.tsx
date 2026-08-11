import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import * as SecureStore from 'expo-secure-store'
import { colorScheme } from 'nativewind'
import type { ReactNode } from 'react'
import { useTheme } from './useTheme'
import { APPEARANCE_SECURE_STORE_KEY } from '../lib/appearancePreference'

// Real nativewind colorScheme (not mocked) — under NODE_ENV=test (Jest's
// default) it exposes a real, synchronous observable rather than delegating
// to the native Appearance module, so it's a faithful, deterministic target
// to assert against instead of a hand-rolled fake.
jest.mock('expo-secure-store')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTheme', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    colorScheme.set('system')
  })

  it('is loading until the persisted preference resolves, then defaults to "system"', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.preference).toBe('system')
  })

  it('applies a persisted "dark" override to NativeWind on load', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.preference).toBe('dark'))
    await waitFor(() => expect(result.current.theme).toBe('dark'))
  })

  it('setPreference persists the new value and updates the resolved theme', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await result.current.setPreference('dark')

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY, 'dark')
    await waitFor(() => expect(result.current.preference).toBe('dark'))
    await waitFor(() => expect(result.current.theme).toBe('dark'))
  })
})
