// Global Jest setup (jest.config.js's `setupFiles`).
//
// react-native-safe-area-context's real `useSafeAreaInsets()` throws hard
// ("No safe area value available") outside a `<SafeAreaProvider>` — fine at
// runtime (app/_layout.tsx wraps the whole tree in one), but every isolated
// component test that renders a screen/primitive without also standing up
// that provider would otherwise need to know to wrap it (components/ui/
// BottomSheet.tsx reaches for real device insets now).
//
// Deliberately NOT the library's own `react-native-safe-area-context/jest/
// mock` — swapping the whole module broke NativeWind's `react-native-css-
// interop` third-party patch for this exact library (it reads a `SafeAreaView`
// shape off the module that the official mock doesn't preserve), taking down
// every test that renders `components/ui/Screen.tsx`. This overrides only the
// one hook, via `requireActual` for everything else, so `SafeAreaView` and
// `SafeAreaProvider` stay the library's real (css-interop-patched)
// implementations and only the imperative insets hook gets a safe default.
import { jest } from '@jest/globals'

jest.mock('react-native-safe-area-context', () => ({
  ...(jest.requireActual('react-native-safe-area-context') as object),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))
