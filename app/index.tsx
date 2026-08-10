import { ActivityIndicator, View } from 'react-native'

// The root guard (app/_layout.tsx's AuthGate → useAuthGuard) owns all
// redirect logic via useSegments(). "/" never matches any known route
// group, so the guard redirects away from here on its first effect run —
// this screen exists only because Expo Router requires something to
// resolve to at "/", and is visible for at most one render.
export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-surface-light dark:bg-surface-dark">
      <ActivityIndicator />
    </View>
  )
}
