import '../global.css'
import '../i18n'
import '../lib/notifications/router'

import { useEffect, useState } from 'react'
import { ActivityIndicator, I18nManager, Platform, View } from 'react-native'
import * as Updates from 'expo-updates'
import { Slot } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../lib/queryClient'
import { useAuth } from '../features/auth/hooks/useAuth'
import { useAuthGuard } from '../features/auth/hooks/useAuthGuard'
import { useHousehold } from '../features/household/hooks/useHousehold'

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

  return <Slot />
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
        <AuthGate />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
