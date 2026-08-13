import '../global.css'
import i18n from '../i18n'
import '../lib/notifications/router'
import '../features/budgets/lib/budgetThresholdSubscriber'

import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native'
import * as Updates from 'expo-updates'
import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../lib/queryClient'
import { useAuth } from '../features/auth/hooks/useAuth'
import { useAuthGuard } from '../features/auth/hooks/useAuthGuard'
import { useHousehold } from '../features/household/hooks/useHousehold'
import { useTheme } from '../features/settings/hooks/useTheme'
import { AppErrorBoundary } from '../components/ui/AppErrorBoundary'
import { captureException, initCrashReporting } from '../lib/monitoring/crashReporting'
import { hideSplashScreen, initSplashGate } from '../lib/monitoring/splashGate'

// Both run once at module load, before first render — Milestone 11 / ADR-033.
// initSplashGate() calls SplashScreen.preventAutoHideAsync() (Expo's own
// documented guidance: call this in global scope, not inside a component)
// and arms a failure-safe timeout so a stuck gate chain never leaves the
// splash screen up forever. Runs first, deliberately: it holds the splash
// regardless of what happens next, so nothing later in this module can ever
// skip arming it. initCrashReporting() no-ops if EXPO_PUBLIC_SENTRY_DSN is
// unset, and never throws even on a real init failure (see its own
// try/catch) — but ordering it second is a free extra safety margin.
initSplashGate()
initCrashReporting()

// The auth guard's own loading state (session restore + household check) is
// rendered here, not inside individual screens — see ARCHITECTURE.md § Auth
// Flow. Nothing route-specific renders until it resolves, which is what
// keeps a signed-in user from ever flashing a sign-in screen (or vice versa).
//
// useHousehold is mounted here (not inside useAuthGuard, which stays
// single-purpose: redirect wiring only) so store/householdStore.ts is
// populated once per session regardless of which screen the user lands on
// first — satisfies §4.4's "on app launch, load the household ID." The
// useAuth() call here is cache-deduped with useAuthGuard's internal call to
// the same hook (same TanStack Query key), not an extra network round trip.
//
// Its own isLoading is folded into this gate too (mobile review finding):
// useAuthGuard's readiness only depends on the lightweight
// useHasHousehold existence check, a separate query from this hook's
// heavier household-details fetch — without this, <Slot/> could render
// before store/householdStore.ts is actually populated, flashing an
// unpopulated store to whatever (app) screen mounts first.
function AuthGate() {
  const { isLoading } = useAuthGuard()
  const { session } = useAuth()
  const { isLoading: isHouseholdLoading } = useHousehold(session?.user.id)

  if (isLoading || (!!session && isHouseholdLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <SplashReadySignal>
      <Slot />
    </SplashReadySignal>
  )
}

// Fires the splash-hide signal the moment this mounts — which only happens
// once AuthGate stops rendering its own spinner, and AuthGate is itself
// nested inside ThemeGate below (ThemeGate returns its spinner instead of
// children while loading, so AuthGate cannot mount at all until ThemeGate has
// already resolved). Mounting is therefore "the whole gate chain settled,"
// with no need to separately thread ThemeGate's loading state down here.
// A thin wrapper component, not an onReady prop on AuthGate itself — keeps
// this Milestone 11 addition to one line of AuthGate's existing return,
// rather than a second behavioral change to an already-reviewed component
// (see the AppErrorBoundary wiring in RootLayout below for the other one).
function SplashReadySignal({ children }: { children: ReactNode }) {
  useEffect(() => {
    hideSplashScreen()
  }, [])

  return <>{children}</>
}

// Holds first paint until the persisted appearance preference has been read
// and applied to NativeWind at least once (see
// features/settings/hooks/useTheme.ts) — without this, the app would render
// one frame under NativeWind's own default ('system') before snapping to
// the user's actual override, a visible flash on cold start. Deliberately a
// separate component from the RTL gate below: it needs QueryClientProvider
// context (useTheme uses useQuery), which isn't mounted yet at the point the
// RTL gate short-circuits — nesting it here, rather than folding the two
// gates into one boolean, leaves the already-reviewed M1 RTL bootstrap
// completely untouched.
function ThemeGate({ children }: { children: ReactNode }) {
  const { theme, isLoading } = useTheme()

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      {children}
    </>
  )
}

// RTL bootstrap — see ARCHITECTURE.md § RTL Implementation.
export default function RootLayout() {
  const [rtlReady, setRtlReady] = useState(I18nManager.isRTL)

  useEffect(() => {
    // Already RTL — the useState initializer above already reflects it.
    if (I18nManager.isRTL) return

    I18nManager.allowRTL(true)
    I18nManager.forceRTL(true)

    // Native persists forceRTL() to native prefs and needs a reload to pick
    // it up on the next launch. Web has no such persistence — forceRTL() is
    // an in-memory flag reset on every page load, so calling reloadAsync()
    // there would reload forever without ever observing isRTL as true.
    // (Caught by the web-export spot check this Milestone 1 gate requires.)
    const settle =
      Platform.OS === 'web'
        ? Promise.resolve()
        : Updates.reloadAsync().catch((error: unknown) => {
            // reloadAsync requires an EAS Update-configured production/dev
            // client build. In Expo Go or a plain dev client it throws — RTL
            // is still forced for the next cold start; we don't crash the
            // dev session over it. Real on-device RTL confirmation is
            // deferred per ADR-030.
            console.warn('[rtl] Updates.reloadAsync unavailable; restart the app manually', error)
          })

    void settle.finally(() => setRtlReady(true))
  }, [])

  if (!rtlReady) return null

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary
          title={i18n.t('appErrorBoundary.title')}
          message={i18n.t('appErrorBoundary.message')}
          retryLabel={i18n.t('appErrorBoundary.retry')}
          onError={(error, info) => {
            // console.error kept for local dev visibility; captureException
            // reports through the centralized, scrubbed crash-reporting
            // layer in production (Milestone 11 / ADR-033). Never log
            // monetary values or tokens, per CLAUDE.md — error/stack/
            // componentStack carry no such data here, and componentStack is
            // a React-internal list of component names, not user data.
            console.error('[AppErrorBoundary]', error, info.componentStack)
            captureException(error, { componentStack: info.componentStack ?? '' })
          }}
        >
          <ThemeGate>
            <AuthGate />
          </ThemeGate>
        </AppErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
