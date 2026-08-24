import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'
import type { Database } from '@/types/database'
import { validateSupabaseConfig } from './validateSupabaseConfig'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

// expo-secure-store has no web implementation — its native module resolves to
// an empty object on web (node_modules/expo-secure-store/*/ExpoSecureStore.web.*),
// so every method throws the moment GoTrueClient reads/writes a session during
// client init. Web falls back to localStorage; native (Keychain/Keystore via
// SecureStore) is completely unchanged.
const WebStorageAdapter = {
  getItem: (key: string) =>
    Promise.resolve(typeof window === 'undefined' ? null : window.localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key)
    return Promise.resolve()
  },
}

const authStorage = Platform.OS === 'web' ? WebStorageAdapter : ExpoSecureStoreAdapter

const { url: supabaseUrl, anonKey: supabaseAnonKey } = validateSupabaseConfig(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
)

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Required for React Native per Supabase's own client guidance: autoRefreshToken
// keeps a JS timer running even while the app is backgrounded unless the client
// is explicitly told to stop. Foreground restarts it; background stops it —
// otherwise the refresh timer either drifts while suspended or keeps firing
// needlessly while nothing can observe it.
//
// Native only, because there is no DOM `visibilitychange` for the timer to
// drift relative to on this platform the way there is on web.
//
// This restart is NOT what prevents queries from racing an expired token on
// resume — an earlier version of this comment claimed it was (for native)
// and that web's own refresh timer needed no equivalent help, which was
// wrong: web has exactly the same race, just via the DOM's own
// `visibilitychange` event instead of AppState, and `startAutoRefresh()`
// here is called without being awaited regardless. The actual fix lives in
// lib/queryClient.ts's focusManager wiring, which awaits
// `supabase.auth.getSession()` — the call that awaits a refresh when the
// stored session is past its margin — before ever telling TanStack Query
// the window/app is focused, on both platforms. See that file's much longer
// comment for the full mechanism (this was the confirmed root cause of the
// intermittent "משהו השתבש. נסו שוב" on Home in the real Vercel/Supabase
// preview). This restart still matters on its own terms — it stops the
// timer from ticking uselessly while backgrounded and restarts it so it
// keeps the token fresh in the background between resumes — it is just not
// the thing that makes resuming safe; the awaited `getSession()` call is.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh()
    } else {
      void supabase.auth.stopAutoRefresh()
    }
  })
}
