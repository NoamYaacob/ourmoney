import '../global.css'
import '../i18n'
import '../lib/notifications/router'

import { useEffect, useState } from 'react'
import { I18nManager, Platform } from 'react-native'
import * as Updates from 'expo-updates'
import { Slot } from 'expo-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { queryClient } from '../lib/queryClient'

// RTL bootstrap — see ARCHITECTURE.md § RTL Implementation. There is no auth
// guard here: no session exists yet in MVP-1 (Milestone 3 adds one). This
// layout is app shell only — providers, RTL, and a route outlet.
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
        <Slot />
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
