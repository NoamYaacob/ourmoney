import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import { createTestQueryClient } from '@/lib/testing/createTestQueryClient'
import * as SecureStore from 'expo-secure-store'
import { colorScheme } from 'nativewind'
import { Appearance, Platform } from 'react-native'
import type { ReactNode } from 'react'
import { useTheme } from './useTheme'
import { APPEARANCE_SECURE_STORE_KEY, appearancePreferenceQueryKey } from '../lib/appearancePreference'

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

// Regression for the reported Web Preview bug: app/_layout.tsx's ThemeGate
// renders a full-screen ActivityIndicator whenever useTheme().isLoading is
// true. Before the fix, expo-secure-store's (thrown-on-web) failure meant
// this query could never succeed, so — because staleTime: Infinity only
// suppresses refetch-on-focus for a query that HAS succeeded — every
// window/tab focus refetched (and re-threw), resetting the query back to a
// fresh isPending:true state and flashing the spinner back on. A real
// Mac/Safari capture against the hosted Preview project confirmed this
// exact transition.
//
// Overrides Platform.OS directly (rather than jest.resetModules() +
// jest.doMock('react-native', ...)) so useTheme/appearancePreference keep
// using the SAME already-loaded React/@tanstack/react-query module
// instances as the rest of this file — resetModules() would otherwise
// create a second React instance, breaking useContext for the freshly
// re-required useTheme.
describe('useTheme (web storage-failure regression)', () => {
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true, writable: true })
  })

  it('does not re-enter a loading spinner when a re-read hits a storage failure on web', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })

    const store = new Map<string, string>()
    let shouldThrow = false
    const localStorageMock = {
      getItem: jest.fn((key: string) => {
        if (shouldThrow) throw new Error('storage unavailable')
        return store.has(key) ? (store.get(key) as string) : null
      }),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key)
      }),
    }
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
      writable: true,
    })

    const queryClient = createTestQueryClient()
    function webWrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }

    const { result } = await renderHook(() => useTheme(), { wrapper: webWrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.preference).toBe('system')

    // Simulate the exact trigger from the real capture: storage now fails
    // on a re-read (e.g. a focus-triggered refetch racing browser storage).
    shouldThrow = true
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: appearancePreferenceQueryKey })
    })

    // The regression proof: this must stay false. Before the fix, a
    // throwing queryFn meant the query could never succeed, so every
    // refetch reset it to a fresh isPending:true state — flashing
    // ThemeGate's spinner back on.
    expect(result.current.isLoading).toBe(false)
    expect(result.current.preference).toBe('system')
  })
})

// RRR §6 P0-2 regression: on web, colorScheme.set('system') under
// tailwind.config.js's `darkMode: 'class'` strategy only clears the manual
// override class — it never re-applies a dark OS/browser preference (see
// useTheme.ts's header comment for the full mechanism). These tests assert
// on useTheme's OWN branching decision (Platform.OS + Appearance calls),
// which is what actually changed, rather than on nativewind's internal DOM
// behavior — jest resolves nativewind's native runtime regardless of the
// Platform.OS override below (there is no metro-style platform-extension
// resolution in this test environment), so the real regression (a real
// browser silently staying light) can only be fully confirmed live; see the
// P0 remediation evidence artifact for that live, real-browser proof.
describe('useTheme (web system-preference resolution — RRR P0-2)', () => {
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    jest.restoreAllMocks()
  })

  it('resolves "system" to the live OS/browser preference and applies it as a concrete value on web, never passing the literal string "system" through', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark')
    jest.spyOn(Appearance, 'addChangeListener').mockReturnValue({ remove: jest.fn() })
    const setSpy = jest.spyOn(colorScheme, 'set')

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.preference).toBe('system'))
    // Polled, not a bare assertion: the layout effect that calls
    // colorScheme.set can flush on a later act() boundary than the one
    // waitFor above observed result.current on, so asserting immediately
    // afterward is a race — waitFor here just re-checks until it's flushed.
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('dark'))
    expect(setSpy).not.toHaveBeenCalledWith('system')
  })

  it('resolves "system" to light when the OS/browser preference is light, on web', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light')
    jest.spyOn(Appearance, 'addChangeListener').mockReturnValue({ remove: jest.fn() })
    const setSpy = jest.spyOn(colorScheme, 'set')

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.preference).toBe('system'))
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('light'))
  })

  it('re-applies a live OS/browser preference change on web while "system" stays selected, without a reload', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light')
    let registeredListener: ((pref: { colorScheme: 'light' | 'dark' | null }) => void) | undefined
    jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
      registeredListener = listener as typeof registeredListener
      return { remove: jest.fn() }
    })
    const setSpy = jest.spyOn(colorScheme, 'set')

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.preference).toBe('system'))
    await waitFor(() => expect(setSpy).toHaveBeenLastCalledWith('light'))
    await waitFor(() => expect(registeredListener).toBeDefined())

    // The OS/browser flips to dark live — no remount, no reload.
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('dark')
    await act(async () => {
      registeredListener?.({ colorScheme: 'dark' })
    })

    await waitFor(() => expect(setSpy).toHaveBeenLastCalledWith('dark'))
  })

  it('unsubscribes the OS-preference listener on unmount', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    jest.spyOn(Appearance, 'getColorScheme').mockReturnValue('light')
    const remove = jest.fn()
    const addChangeListenerSpy = jest.spyOn(Appearance, 'addChangeListener').mockReturnValue({ remove })
    const setSpy = jest.spyOn(colorScheme, 'set')

    const { result, unmount } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.preference).toBe('system'))
    // Confirm the effect that registers the listener has actually flushed
    // before unmounting — otherwise unmount could race the cleanup being
    // registered at all.
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('light'))
    await waitFor(() => expect(addChangeListenerSpy).toHaveBeenCalled())

    unmount()
    await waitFor(() => expect(remove).toHaveBeenCalled())
  })

  it('does not take the web-specific resolution branch on native — colorScheme.set is called with the literal "system" and no Appearance listener is registered', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true })
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    const addChangeListenerSpy = jest.spyOn(Appearance, 'addChangeListener')
    const setSpy = jest.spyOn(colorScheme, 'set')

    const { result } = await renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.preference).toBe('system'))
    await waitFor(() => expect(setSpy).toHaveBeenCalledWith('system'))

    expect(addChangeListenerSpy).not.toHaveBeenCalled()
  })
})
