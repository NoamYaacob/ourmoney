import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

const mockPreventAutoHideAsync = jest.fn()
const mockHideAsync = jest.fn()
const mockAddBreadcrumb = jest.fn()

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: (...args: unknown[]) => mockPreventAutoHideAsync(...args),
  hideAsync: (...args: unknown[]) => mockHideAsync(...args),
}))

jest.mock('./crashReporting', () => ({
  addBreadcrumb: (...args: unknown[]) => mockAddBreadcrumb(...args),
}))

import { hideSplashScreen, initSplashGate } from './splashGate'

describe('splashGate', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
  })

  afterEach(() => {
    // Drain any timer initSplashGate may have armed, so one test's timeout
    // can never fire during a later test.
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('calls preventAutoHideAsync and arms the failsafe timeout on init', () => {
    initSplashGate(5000)
    expect(mockPreventAutoHideAsync).toHaveBeenCalledTimes(1)
    expect(mockHideAsync).not.toHaveBeenCalled()
  })

  it('hides immediately via the ready signal and cancels the pending timeout', () => {
    initSplashGate(5000)
    hideSplashScreen()

    expect(mockHideAsync).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(5000)
    // Timeout was cancelled — no second hideAsync call, no breadcrumb.
    expect(mockHideAsync).toHaveBeenCalledTimes(1)
    expect(mockAddBreadcrumb).not.toHaveBeenCalled()
  })

  it('falls back to the timeout and logs a breadcrumb if the ready signal never fires', () => {
    initSplashGate(5000)

    jest.advanceTimersByTime(5000)

    expect(mockHideAsync).toHaveBeenCalledTimes(1)
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      'Splash screen failure-safe timeout fired',
      'startup'
    )
  })

  it('is safe to call hideSplashScreen more than once (idempotent)', () => {
    initSplashGate(5000)
    hideSplashScreen()
    hideSplashScreen()

    expect(mockHideAsync).toHaveBeenCalledTimes(2)
    expect(() => hideSplashScreen()).not.toThrow()
  })

  it('does not fire the timeout twice if the ready signal wins after a prior init', () => {
    initSplashGate(1000)
    jest.advanceTimersByTime(1000)
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1)

    // A second init (e.g. a hot reload in dev) re-arms cleanly, independent
    // of the first timer having already fired.
    initSplashGate(1000)
    hideSplashScreen()
    jest.advanceTimersByTime(1000)
    expect(mockAddBreadcrumb).toHaveBeenCalledTimes(1)
  })

  it('clears the first timer on a genuinely concurrent re-init, so it never fires as an orphan', () => {
    // Distinct from the test above: here the FIRST timer is still pending
    // (not yet fired) when the second initSplashGate() call happens — the
    // exact "Metro Fast Refresh re-evaluates app/_layout.tsx mid-flight"
    // scenario this module's own doc comment names. Without clearing the
    // prior timer, the first one becomes orphaned and still fires its
    // "timeout" breadcrumb later even though the app was never actually
    // stuck.
    initSplashGate(5000)
    jest.advanceTimersByTime(1000) // first timer still has 4000ms left
    initSplashGate(5000) // concurrent re-init — must cancel the first timer
    hideSplashScreen() // ready signal wins for the second timer

    // Advance past where the FIRST timer's original 5000ms deadline would
    // have landed (1000 + 4000 = 5000ms from its own start).
    jest.advanceTimersByTime(4000)

    expect(mockAddBreadcrumb).not.toHaveBeenCalled()
    expect(mockHideAsync).toHaveBeenCalledTimes(1)
  })
})
