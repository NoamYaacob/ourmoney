// Synchronizes the persisted appearance preference (TanStack Query, backed
// by expo-secure-store — see ../lib/appearancePreference.ts) into
// NativeWind's own colorScheme, one direction only: preference -> render
// state. NativeWind's `colorScheme`/`useColorScheme()` (from the
// `nativewind` package) already IS the single owner of "what's currently
// rendered" — in production it delegates straight to React Native's
// Appearance module, so there is no second copy of that state to keep in
// sync. No Zustand store, no React Context: exactly two state homes
// (the persisted preference, and NativeWind's own render state), never
// three (see docs/DECISIONS.md's Milestone 5 note on this).
//
// `isLoading` is exposed so app/_layout.tsx's ThemeGate can hold the first
// paint until the persisted preference has been read and applied at least
// once — without that gate, the app would render one frame under
// NativeWind's own default ('system') before snapping to the user's actual
// override, a visible flash on cold start.
//
// Uses useLayoutEffect, not useEffect, to apply colorScheme.set() (adversarial
// review finding): a passive effect fires only after the browser/native host
// has already painted the frame, so ThemeGate's children could still commit
// one visible frame under NativeWind's stale/default scheme even after
// isLoading flips to false. A layout effect flushes synchronously before that
// paint, closing the gap between "preference resolved" and "NativeWind
// applied it."
//
// RRR §6 P0-2 — 'system' preference on web needs its own branch, not a bare
// colorScheme.set(preference) pass-through:
// tailwind.config.js sets `darkMode: 'class'` (chosen so the explicit
// light/dark override above can work at all — NativeWind's web runtime
// throws from colorScheme.set() outright under `darkMode: 'media'`, which
// only supports the OS following automatically, with no manual override).
// Under `class` strategy, react-native-css-interop's web runtime
// (runtime/web/color-scheme.ts) treats `.set('system')` as "clear the
// manual override" — it REMOVES the `dark` class from <html> and does
// nothing else. It does not re-add that class for a dark OS/browser
// preference, because doing so is exclusively `media` strategy's job via a
// generated `@media (prefers-color-scheme: dark)` rule, which `class`
// strategy never emits. The result: a 'system' preference silently renders
// the light theme on web, for every user who never touches the in-app
// toggle — the app's default state. On native there is no DOM class to
// keep in sync; `.set('system')` already delegates correctly to
// `Appearance.setColorScheme(null)`, so this branch is web-only.
import { useLayoutEffect } from 'react'
import { Appearance, Platform } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { colorScheme, useColorScheme as useNativeWindColorScheme } from 'nativewind'
import {
  appearancePreferenceQueryKey,
  readAppearancePreference,
  writeAppearancePreference,
  type AppearancePreference,
} from '../lib/appearancePreference'

export function useTheme() {
  const queryClient = useQueryClient()
  const { data: preference, isLoading } = useQuery({
    queryKey: appearancePreferenceQueryKey,
    queryFn: readAppearancePreference,
    staleTime: Infinity,
  })
  const { colorScheme: resolvedTheme } = useNativeWindColorScheme()

  useLayoutEffect(() => {
    if (!preference) return

    if (Platform.OS !== 'web' || preference !== 'system') {
      colorScheme.set(preference)
      return
    }

    // Web + 'system': resolve the real, live OS/browser preference
    // ourselves and apply it as a concrete value, since colorScheme.set
    // ('system') alone would only clear the class (see header comment).
    // react-native-web's Appearance module wraps
    // window.matchMedia('(prefers-color-scheme: dark)') for both the
    // initial read and the change listener, so this also keeps the applied
    // theme correct across a live OS preference change without a reload.
    const applyLiveSystemPreference = () => {
      colorScheme.set(Appearance.getColorScheme() === 'dark' ? 'dark' : 'light')
    }
    applyLiveSystemPreference()
    const subscription = Appearance.addChangeListener(applyLiveSystemPreference)
    return () => subscription.remove()
  }, [preference])

  async function setPreference(next: AppearancePreference): Promise<void> {
    await writeAppearancePreference(next)
    queryClient.setQueryData(appearancePreferenceQueryKey, next)
  }

  return {
    theme: resolvedTheme ?? 'light',
    preference: preference ?? 'system',
    setPreference,
    isLoading,
  }
}
