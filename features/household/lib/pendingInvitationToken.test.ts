import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as SecureStore from 'expo-secure-store'
import { QueryClient } from '@tanstack/react-query'
import {
  PENDING_INVITATION_SECURE_STORE_KEY,
  PENDING_INVITATION_TTL_MS,
  clearPendingInvitationToken,
  pendingInvitationTokenQueryKey,
  readPendingInvitationToken,
  storePendingInvitationToken,
} from './pendingInvitationToken'

jest.mock('expo-secure-store')

function stored(token: string, storedAt: number) {
  return JSON.stringify({ token, storedAt })
}

describe('pendingInvitationToken (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('resolves null when nothing is stored', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null)
    expect(await readPendingInvitationToken()).toBeNull()
  })

  it('resolves the stored token when still within its TTL', async () => {
    jest.mocked(SecureStore.getItemAsync).mockResolvedValue(stored('tok-123', Date.now()))
    expect(await readPendingInvitationToken()).toBe('tok-123')
  })

  it('stores and clears via SecureStore, never window.localStorage', async () => {
    jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined)
    jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined)

    await storePendingInvitationToken('tok-abc')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      PENDING_INVITATION_SECURE_STORE_KEY,
      expect.stringContaining('tok-abc')
    )

    const queryClient = new QueryClient()
    await clearPendingInvitationToken(queryClient)
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(PENDING_INVITATION_SECURE_STORE_KEY)
    expect(queryClient.getQueryData(pendingInvitationTokenQueryKey)).toBeNull()
  })
})

// Root cause of the reported Web Preview bug (see git history): expo-secure-store
// has no real web implementation, so every SecureStore call here used to
// throw on web — and because this token backs a staleTime: Infinity query
// feeding directly into useAuthGuard's combined isLoading (the root
// AuthGate spinner condition), a query that can never succeed is always
// considered stale and refetches (re-throwing) on every window/tab focus,
// resetting back to isPending:true each time. These tests exercise the
// web-only window.localStorage path directly, with a fresh module instance
// per test (jest.resetModules()) so the Platform.OS: 'web' mock is actually
// picked up by the module's own top-level `import { Platform } from
// 'react-native'`.
describe('pendingInvitationToken (web)', () => {
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
    return require('./pendingInvitationToken') as typeof import('./pendingInvitationToken')
  }

  afterEach(() => {
    jest.dontMock('react-native')
    Object.defineProperty(window, 'localStorage', { value: undefined, configurable: true, writable: true })
  })

  it('resolves null when nothing is stored', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)

    await expect(mod.readPendingInvitationToken()).resolves.toBeNull()
    expect(localStorageMock.getItem).toHaveBeenCalledWith(mod.PENDING_INVITATION_SECURE_STORE_KEY)
  })

  it('resolves the stored token when still within its TTL', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)
    localStorageMock.setItem(mod.PENDING_INVITATION_SECURE_STORE_KEY, stored('tok-123', Date.now()))

    await expect(mod.readPendingInvitationToken()).resolves.toBe('tok-123')
  })

  it('treats an expired token as absent and self-cleans it from localStorage', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)
    const expiredAt = Date.now() - (PENDING_INVITATION_TTL_MS + 1_000)
    localStorageMock.setItem(mod.PENDING_INVITATION_SECURE_STORE_KEY, stored('stale-tok', expiredAt))

    await expect(mod.readPendingInvitationToken()).resolves.toBeNull()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(mod.PENDING_INVITATION_SECURE_STORE_KEY)
  })

  it('treats malformed stored data as absent and self-cleans it', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)
    localStorageMock.setItem(mod.PENDING_INVITATION_SECURE_STORE_KEY, 'not-valid-json')

    await expect(mod.readPendingInvitationToken()).resolves.toBeNull()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(mod.PENDING_INVITATION_SECURE_STORE_KEY)
  })

  // The exact mechanism behind the reported bug: a genuinely broken/throwing
  // storage must resolve, not reject, or the query can never succeed and
  // stays permanently "stale."
  it('resolves null, never rejects, when localStorage.getItem throws', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled')
    })
    const mod = loadWebModule(localStorageMock)

    await expect(mod.readPendingInvitationToken()).resolves.toBeNull()
  })

  it('resolves null, never rejects, when window.localStorage is unavailable', async () => {
    const mod = loadWebModule(null)
    await expect(mod.readPendingInvitationToken()).resolves.toBeNull()
  })

  it('writes and clears via localStorage under the expected key', async () => {
    const localStorageMock = createLocalStorageMock()
    const mod = loadWebModule(localStorageMock)

    await mod.storePendingInvitationToken('tok-web')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      mod.PENDING_INVITATION_SECURE_STORE_KEY,
      expect.stringContaining('tok-web')
    )

    const queryClient = new QueryClient()
    await mod.clearPendingInvitationToken(queryClient)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(mod.PENDING_INVITATION_SECURE_STORE_KEY)
    expect(queryClient.getQueryData(mod.pendingInvitationTokenQueryKey)).toBeNull()
  })

  // Cosmetic-degradation requirement: a write/delete failure must not throw
  // or crash the app.
  it('does not throw when localStorage.setItem fails', async () => {
    const localStorageMock = createLocalStorageMock()
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const mod = loadWebModule(localStorageMock)

    await expect(mod.storePendingInvitationToken('tok-x')).resolves.toBeUndefined()
  })

  it('does not throw when storing/clearing with window.localStorage unavailable', async () => {
    const mod = loadWebModule(null)
    await expect(mod.storePendingInvitationToken('tok-x')).resolves.toBeUndefined()
    await expect(mod.clearPendingInvitationToken(new QueryClient())).resolves.toBeUndefined()
  })
})
