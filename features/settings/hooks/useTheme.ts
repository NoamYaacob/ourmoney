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

import { useEffect, useLayoutEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { colorScheme, useColorScheme as useNativeWindColorScheme } from 'nativewind'
import {
  appearancePreferenceQueryKey,
  readAppearancePreference,
  writeAppearancePreference,
  type AppearancePreference,
} from '../lib/appearancePreference'
// TEMPORARY — spinner-flash-on-tab-focus investigation. See
// lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
import { diagLog } from '@/lib/debug/spinnerDiagnostics'

export function useTheme() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: appearancePreferenceQueryKey,
    queryFn: readAppearancePreference,
    staleTime: Infinity,
  })
  const { data: preference, isLoading } = query
  const { colorScheme: resolvedTheme } = useNativeWindColorScheme()

  // TEMPORARY diagnostic — see lib/debug/spinnerDiagnostics.ts.
  useEffect(() => {
    diagLog('useTheme mount', {})
    return () => diagLog('useTheme unmount', {})
  }, [])

  useEffect(() => {
    diagLog('useTheme query', {
      status: query.status,
      fetchStatus: query.fetchStatus,
      hasData: query.data !== undefined,
      dataUpdatedAt: query.dataUpdatedAt,
    })
  }, [query.status, query.fetchStatus, query.data, query.dataUpdatedAt])

  useLayoutEffect(() => {
    if (preference) colorScheme.set(preference)
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
