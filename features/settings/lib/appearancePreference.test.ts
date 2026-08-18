import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as SecureStore from 'expo-secure-store'
import {
  APPEARANCE_SECURE_STORE_KEY,
  readAppearancePreference,
  writeAppearancePreference,
} from './appearancePreference'

jest.mock('expo-secure-store')

describe('appearancePreference (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('defaults to "system" when nothing is stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    expect(await readAppearancePreference()).toBe('system')
  })

  it('returns the stored preference when valid', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')
    expect(await readAppearancePreference()).toBe('dark')
  })

  it('defaults to "system" for a malformed/unexpected stored value', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('not-a-real-preference')
    expect(await readAppearancePreference()).toBe('system')
  })

  it('writes the preference under the expected key', async () => {
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    await writeAppearancePreference('light')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY, 'light')
  })

  // Regression proof (root cause of the reported Web Preview spinner-flash
  // bug): expo-secure-store must remain the storage backend on native —
  // the web-only localStorage path added below must never be reachable
  // here, on pain of native losing its persisted appearance override.
  it('calls SecureStore, never window.localStorage, on native', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)

    await readAppearancePreference()
    await writeAppearancePreference('light')

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY, 'light')
  })
})

// Root cause of the reported Web Preview bug (see git history): expo-secure-store
// has no real web implementation — its native module resolves to an empty
// object on web, so every SecureStore call used to throw there. Because
// features/settings/hooks/useTheme.ts's query has staleTime: Infinity, which
// only suppresses refetch-on-focus once a query has actually succeeded, a
// query that can never succeed is always "stale" and refetches (and re-throws)
// on every window/tab focus — which is what flashed ThemeGate's root spinner
// back on repeatedly. These tests exercise the web-only window.localStorage
// path directly, with a fresh module instance per test (jest.resetModules())
// so the Platform.OS: 'web' mock is actually picked up by the module's own
// top-level `import { Platform } from 'react-native'`.
describe('appearancePreference (web)', () => {
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

    if (localStorageMock) {
      Object.defineProperty(window, 'localStorage', {
        value: localStorageMock,
        configurable: true,
        writable: true,
      })
    } else {
      Object.defineProperty(window, 'localStorage', {
        value: undefined,
        configurable: true,
        writable: true,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./appearancePreference') as typeof import('./appearancePreference')
  }

  afterEach(() => {
    jest.dontMock('react-native')
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true, writable: true })
  })

  it('resolves to "system" when nothing is stored', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)

    await expect(mod.readAppearancePreference()).resolves.toBe('system')
    expect(localStorageMock.getItem).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY)
  })

  it('returns the stored preference when valid', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)
    localStorageMock.setItem(APPEARANCE_SECURE_STORE_KEY, 'dark')

    await expect(mod.readAppearancePreference()).resolves.toBe('dark')
  })

  it('defaults to "system" for a malformed/unexpected stored value', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)
    localStorageMock.setItem(APPEARANCE_SECURE_STORE_KEY, 'not-a-real-preference')

    await expect(mod.readAppearancePreference()).resolves.toBe('system')
  })

  // The exact mechanism behind the reported bug: a genuinely broken/throwing
  // storage must resolve, not reject, or the query can never succeed and
  // stays permanently "stale" (see the describe block's header comment).
  it('resolves to "system", never rejects, when localStorage.getItem throws', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    const mod = loadWebModule(localStorageMock)

    await expect(mod.readAppearancePreference()).resolves.toBe('system')
  })

  it('resolves to "system", never rejects, when window.localStorage is unavailable', async () => {
    const mod = loadWebModule(null)

    await expect(mod.readAppearancePreference()).resolves.toBe('system')
  })

  it('writes the preference to localStorage under the expected key', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)

    await mod.writeAppearancePreference('dark')

    expect(localStorageMock.setItem).toHaveBeenCalledWith(APPEARANCE_SECURE_STORE_KEY, 'dark')
  })

  // Cosmetic preference — a write failure (Safari private-mode quota,
  // storage disabled, etc.) must not crash or blank the app.
  it('does not throw when localStorage.setItem fails', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const mod = loadWebModule(localStorageMock)

    await expect(mod.writeAppearancePreference('dark')).resolves.toBeUndefined()
  })

  it('does not throw when writing with window.localStorage unavailable', async () => {
    const mod = loadWebModule(null)

    await expect(mod.writeAppearancePreference('dark')).resolves.toBeUndefined()
  })
})
