import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as SecureStore from 'expo-secure-store'
import {
  BIOMETRIC_ENABLED_SECURE_STORE_KEY,
  readBiometricPreference,
  writeBiometricPreference,
} from './biometricPreference'

jest.mock('expo-secure-store')

describe('biometricPreference (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('defaults to enabled (true) when nothing is stored — fail closed', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    expect(await readBiometricPreference()).toBe(true)
  })

  it('defaults to enabled (true) for a malformed stored value — fail closed', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('not-a-boolean')
    expect(await readBiometricPreference()).toBe(true)
  })

  it('returns false only when explicitly stored as "false"', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('false')
    expect(await readBiometricPreference()).toBe(false)
  })

  it('returns true when explicitly stored as "true"', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('true')
    expect(await readBiometricPreference()).toBe(true)
  })

  it('writes the preference under the expected key', async () => {
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    await writeBiometricPreference(false)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(BIOMETRIC_ENABLED_SECURE_STORE_KEY, 'false')
  })

  it('calls SecureStore, never window.localStorage, on native', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('true')
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)

    await readBiometricPreference()
    await writeBiometricPreference(true)

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(BIOMETRIC_ENABLED_SECURE_STORE_KEY)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(BIOMETRIC_ENABLED_SECURE_STORE_KEY, 'true')
  })
})

// Root cause of the reported Web Preview bug (see git history): same
// expo-secure-store-has-no-web-implementation mechanism already fixed for
// features/settings/lib/appearancePreference.ts. A query that can never
// succeed is always stale regardless of staleTime: Infinity, so it
// refetches (and re-throws) on every window/tab focus.
describe('biometricPreference (web)', () => {
  function createLocalStorageMock() {
    const store = new Map<string, string>()
    return {
      getItem: jest.fn((key: string) => (store.has(key) ? (store.get(key) as string) : null)),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value)
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key)
      }),
    }
  }

  function loadWebModule(localStorageMock: ReturnType<typeof createLocalStorageMock> | null) {
    jest.resetModules()
    jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }))

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock ?? undefined,
      configurable: true,
      writable: true,
    })

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./biometricPreference') as typeof import('./biometricPreference')
  }

  afterEach(() => {
    jest.dontMock('react-native')
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true, writable: true })
  })

  it('defaults to enabled (true) when nothing is stored — fail closed', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)

    await expect(mod.readBiometricPreference()).resolves.toBe(true)
    expect(localStorageMock.getItem).toHaveBeenCalledWith(mod.BIOMETRIC_ENABLED_SECURE_STORE_KEY)
  })

  it('returns false only when explicitly stored as "false"', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)
    localStorageMock.setItem(mod.BIOMETRIC_ENABLED_SECURE_STORE_KEY, 'false')

    await expect(mod.readBiometricPreference()).resolves.toBe(false)
  })

  // The exact mechanism behind the reported bug: a genuinely broken/throwing
  // storage must resolve, not reject, or the query can never succeed and
  // stays permanently "stale." Also proves the fail-closed default holds
  // even when storage itself is broken.
  it('resolves to true (fail closed), never rejects, when localStorage.getItem throws', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    const mod = loadWebModule(localStorageMock)

    await expect(mod.readBiometricPreference()).resolves.toBe(true)
  })

  it('resolves to true (fail closed), never rejects, when window.localStorage is unavailable', async () => {
    const mod = loadWebModule(null)
    await expect(mod.readBiometricPreference()).resolves.toBe(true)
  })

  it('writes the preference to localStorage under the expected key', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)

    await mod.writeBiometricPreference(false)

    expect(localStorageMock.setItem).toHaveBeenCalledWith(mod.BIOMETRIC_ENABLED_SECURE_STORE_KEY, 'false')
  })

  it('does not throw when localStorage.setItem fails', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const mod = loadWebModule(localStorageMock)

    await expect(mod.writeBiometricPreference(false)).resolves.toBeUndefined()
  })

  it('does not throw when writing with window.localStorage unavailable', async () => {
    const mod = loadWebModule(null)
    await expect(mod.writeBiometricPreference(false)).resolves.toBeUndefined()
  })
})
