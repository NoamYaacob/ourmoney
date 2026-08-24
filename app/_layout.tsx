import '../global.css'
import i18n from '../i18n'
import '../lib/notifications/router'
import '../features/budgets/lib/budgetThresholdSubscriber'

import { useEffect, useState, type ReactNode } from 'react'
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native'
import { enableScreens } from 'react-native-screens'
import * as Updates from 'expo-updates'
import { useFonts } from 'expo-font'
import {
  Assistant_400Regular,
  Assistant_500Medium,
  Assistant_600SemiBold,
  Assistant_700Bold,
} from '@expo-google-fonts/assistant'
import { Heebo_500Medium, Heebo_700Bold, Heebo_800ExtraBold } from '@expo-google-fonts/heebo'
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

// Holds first paint until Heebo and Assistant are resident, so the product
// never paints one frame in the system font and then reflows into its own
// typography — the same cold-start flash ThemeGate below exists to prevent,
// and far more visible here because every screen's figures change width.
//
// Only the seven weights the design system actually names are loaded (four
// Assistant, three Heebo). Loading a family's full range would cost startup
// time for faces no screen ever asks for.
//
// Deliberately proceeds on failure as well as on success: `useFonts` reports
// an error if a face can't be decoded, and a household that can't read its
// balance because a webfont 404'd is a far worse outcome than one reading it
// in the system font. The Tailwind `fontFamily` stacks all end in
// `system-ui, sans-serif` precisely so that degradation is a fallback rather
// than a blank screen.
function FontGate({ children }: { children: ReactNode }) {
  const [loaded, error] = useFonts({
    Assistant_400Regular,
    Assistant_500Medium,
    Assistant_600SemiBold,
    Assistant_700Bold,
    Heebo_500Medium,
    Heebo_700Bold,
    Heebo_800ExtraBold,
  })

  useEffect(() => {
    if (error) {
      console.warn('[fonts] falling back to the system font', error)
    }
  }, [error])

  if (!loaded && !error) {
    return (
      <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
        <ActivityIndicator />
      </View>
    )
  }

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

// Sets the web document's direction before first paint.
//
// react-native-web's I18nManager is a no-op: `forceRTL()` returns without
// doing anything and `getConstants().isRTL` is hard-coded `false` (see
// node_modules/react-native-web/dist/exports/I18nManager/index.js). The
// bootstrap below genuinely flips native layout and achieves nothing at all
// on web, so without this the browser lays the whole app out left-to-right:
// `flex-row` puts the first child on the LEFT, and every logical property —
// `start`/`end`, `ms-`/`me-`, `ps-`/`pe-`, `border-s`, `text-start` —
// silently resolves against LTR.
//
// The app had compensated for the row-order half of that with
// `flex-row-reverse` at 83 call sites, which fixed the order while leaving
// padding, margins, borders and alignment mirrored the wrong way. The design
// system states the intended rule outright: the layout is
// `flex-direction: row` under `dir="rtl"`, not `row-reverse`. Declaring the
// direction once makes that true everywhere, and those compensations came
// out in the same change that added this.
//
// Not done via Expo Router's `+html.tsx`: that file is only used under
// static rendering (`web.output: "static"`), and this app ships as an SPA,
// where Expo serves its own index.html template. Doing it here works under
// both output modes and does not change the deployment shape.
//
// Runs at module scope rather than in an effect so it lands before React
// paints anything — there is no LTR frame to flash.
function applyWebDocumentDirection() {
  if (Platform.OS !== 'web') return
  if (typeof document === 'undefined') return

  document.documentElement.setAttribute('dir', 'rtl')
  // `lang` drives the browser's own font selection and hyphenation, and is
  // what a screen reader uses to choose a Hebrew voice.
  document.documentElement.setAttribute('lang', 'he')
}

applyWebDocumentDirection()

// Fixes a real, previously-documented bug (docs/KNOWN_ISSUES.md's
// "Inactive tab screens stay mounted and interactive on web" — found via
// Playwright driving the app with real mouse clicks: after Home →
// Transactions, `document.querySelectorAll` found two live copies of the
// same row's text in the DOM at once, both `pointer-events: auto`).
//
// Root cause, traced to source: expo-router's vendored bottom-tabs view
// (node_modules/expo-router/build/react-navigation/bottom-tabs/views/
// ScreenFallback.js) only renders a tab's scene through react-native-
// screens' own `Screen` component — the one that actually removes an
// inactive scene from layout/hit-testing — when `Screens.screensEnabled()`
// is true. Nothing in this app ever called `enableScreens()`, and
// react-native-screens' own default (core.ts: `ENABLE_SCREENS =
// isNativePlatformSupported`) is `false` on web, so every inactive tab fell
// back to a plain `View` that BottomTabView.js only pushes behind the
// active tab with `zIndex: -1` — visually hidden, but never removed from
// hit-testing, and its queries/effects never stop running either.
//
// react-native-screens 4.26 (the version this app has installed) ships a
// real web implementation (components/Screen.web.tsx): once `enabled` is
// true, an inactive screen (`activityState === 0`, which
// BottomTabView.js's own `detachInactiveScreens` already defaults to `true`
// on web — see that file — independently of this call) renders with
// `hidden={true}` and `style={{ display: 'none' }}`, which removes it from
// layout, paint, AND hit-testing entirely on web — strictly stronger than a
// `pointerEvents="none"` patch, and unlike one, requires no changes to any
// vendored file. `enableScreens()` itself does nothing risky on native
// (core.ts already defaults `ENABLE_SCREENS` to `true` there via
// `isNativePlatformSupported`, so this call is a no-op re-affirmation on
// iOS/Android) — it only changes behavior on web, which is exactly the
// platform the bug was on. Called at module scope, before any screen ever
// mounts, for the same "must land before first paint" reason
// applyWebDocumentDirection() above does.
enableScreens()

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
          <FontGate>
            <ThemeGate>
              <AuthGate />
            </ThemeGate>
          </FontGate>
        </AppErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
