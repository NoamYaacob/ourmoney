import { describe, expect, it, jest } from '@jest/globals'

// Uses require(), not dynamic import() — this Jest environment (Babel/
// jest-expo, no --experimental-vm-modules) doesn't support dynamic import()
// in test files. require() after jest.resetModules()/jest.doMock() is the
// standard Jest pattern for re-importing a module under different mocked
// dependencies within one test file.
//
// jest.mock (hoisted, not jest.doMock) for the Supabase client: registering
// it here — once, unconditionally — means it survives every
// jest.resetModules() call below (resetModules clears the module instance
// cache, not mock-factory registrations), so every require('./queryClient')
// in this file gets the mock rather than the real client.ts throwing at
// import time for missing env vars. The mock's `getSession` defaults to
// jest.fn() (resolves undefined) unless a test configures otherwise;
// queryClient.ts wraps its result in Promise.resolve(...) specifically so
// that default is safe to await.
jest.mock('@/lib/supabase/client')

describe('queryClient focusManager wiring', () => {
  // Regression test for the actual root cause of the intermittent
  // "משהו השתבש. נסו שוב" reported on Home in the real Vercel/Supabase
  // preview: useSafeToSpend's six queries (features/cashflow/hooks/
  // useSafeToSpend.ts) all fire on TanStack Query's focus signal, and used
  // to fire the INSTANT the tab/app regained focus — before Supabase's own
  // token refresh had any chance to land, since a hidden browser tab throttles
  // JS timers and a backgrounded native app suspends the JS engine entirely.
  // Any of the six hitting PostgREST with an expired JWT surfaces as this
  // exact error, and `retry: 2` only retries against the same stale token.
  //
  // The fix is causal, not a longer retry count: `focusManager`'s callback
  // must not report "focused" until `supabase.auth.getSession()` — which
  // itself awaits a refresh when the stored session is past its expiry
  // margin (confirmed against the installed @supabase/auth-js source,
  // GoTrueClient#__loadSession) — has resolved. This test proves the
  // ordering directly: while getSession() is still pending, handleFocus must
  // not have been called with true yet; only after it resolves does the
  // window get reported as focused.
  it('does not report the window as focused until the Supabase session check resolves — the actual fix for the intermittent Home error', () => {
    jest.resetModules()
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
      AppState: { addEventListener: jest.fn() },
    }))

    let resolveSession: (() => void) | undefined
    const getSession = jest.fn(
      () =>
        new Promise<{ data: { session: null } }>((resolve) => {
          resolveSession = () => resolve({ data: { session: null } })
        })
    )
    jest.doMock('@/lib/supabase/client', () => ({ supabase: { auth: { getSession } } }))

    const documentListeners: Record<string, () => void> = {}
    ;(global as { document?: unknown }).document = {
      visibilityState: 'visible',
      addEventListener: (event: string, listener: () => void) => {
        documentListeners[event] = listener
      },
      removeEventListener: jest.fn(),
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    const ourCallback = setEventListenerSpy.mock.calls[0]![0] as (
      handleFocus: (focused: boolean) => void
    ) => (() => void) | undefined
    const handleFocus = jest.fn()
    ourCallback(handleFocus)

    documentListeners.visibilitychange?.()

    // The session check has fired but not resolved — the window must not
    // read as focused yet, which is exactly what stops the six financial
    // queries from refetching against a token that has not been confirmed
    // fresh.
    expect(getSession).toHaveBeenCalledTimes(1)
    expect(handleFocus).not.toHaveBeenCalled()

    resolveSession?.()

    return Promise.resolve()
      .then(() => Promise.resolve())
      .then(() => {
        expect(handleFocus).toHaveBeenCalledWith(true)
      })
      .finally(() => {
        setEventListenerSpy.mockRestore()
        jest.dontMock('react-native')
        delete (global as { document?: unknown }).document
        delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
      })
  })

  it('reports the window as unfocused immediately on web, with no session check to wait for', async () => {
    jest.resetModules()
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
      AppState: { addEventListener: jest.fn() },
    }))

    const getSession = jest.fn()
    jest.doMock('@/lib/supabase/client', () => ({ supabase: { auth: { getSession } } }))

    const documentListeners: Record<string, () => void> = {}
    ;(global as { document?: unknown }).document = {
      visibilityState: 'hidden',
      addEventListener: (event: string, listener: () => void) => {
        documentListeners[event] = listener
      },
      removeEventListener: jest.fn(),
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    const ourCallback = setEventListenerSpy.mock.calls[0]![0] as (
      handleFocus: (focused: boolean) => void
    ) => (() => void) | undefined
    const handleFocus = jest.fn()
    ourCallback(handleFocus)

    documentListeners.visibilitychange?.()

    expect(handleFocus).toHaveBeenCalledWith(false)
    expect(getSession).not.toHaveBeenCalled()

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
    delete (global as { document?: unknown }).document
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
  })

  it('wires focusManager to AppState on native, awaiting the session check before reporting active', async () => {
    jest.resetModules()
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
    let nativeListener: ((state: string) => void) | undefined
    const removeMock = jest.fn()

    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios' },
      AppState: {
        addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
          nativeListener = listener
          return { remove: removeMock }
        }),
      },
    }))

    const getSession = jest.fn(() => Promise.resolve({ data: { session: null } }))
    jest.doMock('@/lib/supabase/client', () => ({ supabase: { auth: { getSession } } }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    expect(setEventListenerSpy).toHaveBeenCalledTimes(1)
    expect(nativeListener).toBeDefined()

    const ourCallback = setEventListenerSpy.mock.calls[0]![0] as (
      handleFocus: (focused: boolean) => void
    ) => (() => void) | undefined
    const handleFocus = jest.fn()
    const unsubscribe = ourCallback(handleFocus)

    nativeListener?.('active')
    // Same ordering guarantee as web: the callback fires, but the session
    // check is still in flight, so handleFocus(true) has not landed yet.
    expect(handleFocus).not.toHaveBeenCalled()
    await Promise.resolve().then(() => Promise.resolve())
    expect(handleFocus).toHaveBeenLastCalledWith(true)

    nativeListener?.('background')
    expect(handleFocus).toHaveBeenLastCalledWith(false)

    unsubscribe?.()
    expect(removeMock).toHaveBeenCalled()

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
  })

  it('wires focusManager on web too — TanStack’s own default web listener has no session check, which was the bug', () => {
    jest.resetModules()
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
      AppState: { addEventListener: jest.fn() },
    }))
    jest.doMock('@/lib/supabase/client', () => ({ supabase: { auth: { getSession: jest.fn() } } }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    expect(setEventListenerSpy).toHaveBeenCalledTimes(1)

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
  })
})

describe('queryClient Fast Refresh survival', () => {
  // Regression test for the reported Web Preview bug: the root spinner in
  // app/_layout.tsx's AuthGate (rendered whenever useAuthGuard().isLoading
  // or useHousehold(...).isLoading is true) was flashing on and off
  // continuously. Root cause: this module used to export a plain
  // `export const queryClient = new QueryClient(...)`. Metro Fast Refresh
  // re-evaluates a module's body whenever it (or anything that imports it,
  // e.g. app/_layout.tsx) changes during the Web Preview dev server's normal
  // operation — the same "app/_layout.tsx mid-flight" scenario
  // lib/monitoring/splashGate.ts's own comment documents and guards
  // against, which this file previously did not. Each re-evaluation handed
  // app/_layout.tsx's <QueryClientProvider> a brand new, empty QueryClient
  // (picked up via the live ES module binding on RootLayout's next render),
  // silently wiping the entire cache — session, household membership,
  // household details, everything AuthGate's isLoading gate depends on.
  // From AuthGate's perspective that's indistinguishable from a genuine
  // cold start: every gated query goes back to isPending:true until it
  // refetches, flashing the root spinner for as long as Fast Refresh kept
  // re-triggering.
  //
  // jest.resetModules() clears the module registry so the next require()
  // re-executes this file's body fresh — exactly what Fast Refresh does at
  // runtime — while globalThis (unlike this module's own top-level
  // `const`) survives across it, exactly like the real runtime. That makes
  // this test a faithful, non-live-server way to prove the fix: the second
  // require() must return the SAME client, with the data set through the
  // first one still intact, instead of a fresh empty one.
  it('returns the same QueryClient instance (with its cache intact) across a simulated Fast Refresh re-evaluation', () => {
    jest.resetModules()
    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
      AppState: { addEventListener: jest.fn() },
    }))

    delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const first = require('./queryClient') as typeof import('./queryClient')
      first.queryClient.setQueryData(['auth', 'session'], { user: { id: 'user-1' } })

      jest.resetModules()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const second = require('./queryClient') as typeof import('./queryClient')

      expect(second.queryClient).toBe(first.queryClient)
      expect(second.queryClient.getQueryData(['auth', 'session'])).toEqual({
        user: { id: 'user-1' },
      })
    } finally {
      delete (globalThis as { __ourMoneyQueryClient?: unknown }).__ourMoneyQueryClient
      jest.dontMock('react-native')
    }
  })
})
