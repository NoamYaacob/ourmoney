import { AppState, Platform, type AppStateStatus } from 'react-native'
import { QueryClient, focusManager } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
})

// TanStack Query's default focus listener is web-only (it listens for the
// DOM 'visibilitychange' event, which does not exist on React Native) — a
// pre-existing gap that had no consequence until Milestone 6, since nothing
// financial depended on "refetch when the app comes back to the
// foreground" before now. Supabase Realtime's postgres_changes channel does
// not replay missed events across a websocket suspension while
// backgrounded, so without this wiring, resuming a backgrounded app could
// leave transactions/budgets data stale indefinitely until some other event
// happened to trigger a refetch — undercutting the MVP-2 exit criterion
// "partner sees a new transaction within 2 seconds" for the ordinary case
// of a backgrounded-then-foregrounded app. Not called on web: web already
// gets a working default listener, and double-wiring would fire the
// invalidation twice per transition for no benefit.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      handleFocus(state === 'active')
    })
    return () => subscription.remove()
  })
}
