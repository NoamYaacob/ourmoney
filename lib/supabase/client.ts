import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState, Platform } from 'react-native'
import type { Database } from '@/types/database'

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

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// Fail loudly at startup rather than letting createClient() throw an opaque
// "supabaseUrl is required" error, or worse, silently construct a client
// that fails confusingly on its first real request.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Set them in your .env before starting the app.'
  )
}

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
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh()
  } else {
    void supabase.auth.stopAutoRefresh()
  }
})
