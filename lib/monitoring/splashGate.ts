// Milestone 11. Coordinates SplashScreen.hideAsync() between the app's real
// readiness signal (app/_layout.tsx's SplashReadySignal, fired once the
// RTL/Theme/Auth gate chain resolves) and a failure-safe timeout, so a stuck
// gate never leaves the user staring at the splash screen indefinitely.
//
// Extracted out of app/_layout.tsx purely for unit-testability —
// app/_layout.tsx imports global.css and isn't importable under Jest without
// heavy additional setup, the same reason lib/money/arithmetic.ts etc. keep
// pure logic out of the screen/layout files that use it.
//
// hideSplashScreen() is safe to call more than once (SplashScreen.hideAsync()
// is documented as idempotent) — whichever of "ready signal" or "timeout"
// fires first wins, the other is a harmless no-op.

import * as SplashScreen from 'expo-splash-screen'
import { addBreadcrumb } from './crashReporting'

const FAILSAFE_TIMEOUT_MS = 5000

let timeoutId: ReturnType<typeof setTimeout> | null = null

export function initSplashGate(timeoutMs: number = FAILSAFE_TIMEOUT_MS): void {
  void SplashScreen.preventAutoHideAsync()

  // Clear any previously-armed timer before arming a new one — without
  // this, a concurrent re-init (e.g. Metro Fast Refresh re-evaluating
  // app/_layout.tsx in dev) orphans the first timer instead of cancelling
  // it, so it still fires its "timeout" breadcrumb later even though the
  // app was actually ready.
  if (timeoutId) {
    clearTimeout(timeoutId)
  }

  timeoutId = setTimeout(() => {
    timeoutId = null
    // A stuck-splash pattern in production should surface in Sentry rather
    // than only being silently masked by the timeout.
    addBreadcrumb('Splash screen failure-safe timeout fired', 'startup')
    void SplashScreen.hideAsync()
  }, timeoutMs)
}

export function hideSplashScreen(): void {
  if (timeoutId) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  void SplashScreen.hideAsync()
}
