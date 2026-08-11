import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import * as SecureStore from 'expo-secure-store'
import type { ReactNode } from 'react'
import { useBiometricPreference } from './useBiometricPreference'
import { BIOMETRIC_ENABLED_SECURE_STORE_KEY } from '../lib/biometricPreference'

jest.mock('expo-secure-store')

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useBiometricPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reads enabled=true (fail-closed default) before and after resolving with nothing stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)

    const { result } = await renderHook(() => useBiometricPreference(), { wrapper })
    expect(result.current.enabled).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.enabled).toBe(true)
  })

  it('reads enabled=false once the stored preference resolves to disabled', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('false')

    const { result } = await renderHook(() => useBiometricPreference(), { wrapper })
    await waitFor(() => expect(result.current.enabled).toBe(false))
  })

  it('setEnabled persists the new value and updates the cached preference', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)

    const { result } = await renderHook(() => useBiometricPreference(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    result.current.setEnabled(false)

    await waitFor(() =>
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(BIOMETRIC_ENABLED_SECURE_STORE_KEY, 'false')
    )
    await waitFor(() => expect(result.current.enabled).toBe(false))
  })
})
