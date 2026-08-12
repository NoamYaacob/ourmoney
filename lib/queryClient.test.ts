import { describe, expect, it, jest } from '@jest/globals'

// Uses require(), not dynamic import() — this Jest environment (Babel/
// jest-expo, no --experimental-vm-modules) doesn't support dynamic import()
// in test files. require() after jest.resetModules()/jest.doMock() is the
// standard Jest pattern for re-importing a module under different mocked
// dependencies within one test file.

describe('queryClient focusManager wiring', () => {
  it('wires focusManager to AppState on native and forwards active/background', () => {
    jest.resetModules()
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
    expect(handleFocus).toHaveBeenLastCalledWith(true)

    nativeListener?.('background')
    expect(handleFocus).toHaveBeenLastCalledWith(false)

    unsubscribe?.()
    expect(removeMock).toHaveBeenCalled()

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
  })

  it('does not wire focusManager on web', () => {
    jest.resetModules()
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
      AppState: { addEventListener: jest.fn() },
    }))

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { focusManager } = require('@tanstack/react-query')
    const setEventListenerSpy = jest.spyOn(focusManager, 'setEventListener')

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./queryClient')

    expect(setEventListenerSpy).not.toHaveBeenCalled()

    setEventListenerSpy.mockRestore()
    jest.dontMock('react-native')
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
