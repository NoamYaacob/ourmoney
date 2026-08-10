import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'
import type { Database } from '@/types/database'

const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)

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
