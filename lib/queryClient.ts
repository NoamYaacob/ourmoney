import { AppState, Platform, type AppStateStatus } from 'react-native'
import { QueryClient, focusManager } from '@tanstack/react-query'

// Metro Fast Refresh re-evaluates this module's body whenever it (or a
// module that imports it, e.g. app/_layout.tsx) changes during the Web
// Preview dev server's normal operation — the same "app/_layout.tsx
// mid-flight" scenario lib/monitoring/splashGate.ts's own comment documents
// and guards against. A plain `export const queryClient = new
// QueryClient(...)` hands app/_layout.tsx's <QueryClientProvider> a brand
// new, empty client on every such re-evaluation: `queryClient` is imported
// via a live ES module binding, so RootLayout's next render reads whatever
// this module currently exports, and QueryClientProvider re-keys every
// useQuery consumer off that new reference. That silently wipes the entire
// cache — session, household membership, household details, everything
// AuthGate's isLoading gate depends on — which is indistinguishable, from
// AuthGate's perspective, from a genuine cold start: every gated query goes
// back to isPending:true until it refetches, flashing the root spinner on
// and off for as long as Fast Refresh keeps re-triggering (the reported
// Web Preview bug — "the entire screen disappears and the root centered
// ActivityIndicator appears briefly," repeating continuously).
//
// Caching the instance on globalThis survives module re-evaluation (this
// module's own top-level binding does not). A real cold start or a
// production build is unaffected either way: globalThis.__ourMoneyQueryClient
// is unset on first import in both cases, so exactly one client is ever
// constructed there too.
declare global {
  // `var`, not `let`/`const`: required for declaration merging with the
  // ambient global scope inside a `declare global` block.
  // eslint-disable-next-line no-var
  var __ourMoneyQueryClient: QueryClient | undefined
  // TEMPORARY — spinner-flash-on-tab-focus investigation. See
  // lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
  // A plain counter, incremented only when a client is actually
  // constructed (never when the globalThis-cached one above is reused) —
  // exposes no data, just proves whether tab-focus-return is genuinely
  // constructing a fresh client (module re-evaluation with globalThis
  // intact — Fast Refresh) versus something else entirely (globalThis
  // itself would be wiped by a true page reload, so this would read back
  // as 1 either way in that case — cross-check against the page lifecycle
  // event log for that distinction).
  // eslint-disable-next-line no-var
  var __ourMoneyQueryClientConstructCount: number | undefined
}

const isReusingExistingClient = !!globalThis.__ourMoneyQueryClient

export const queryClient =
  globalThis.__ourMoneyQueryClient ??
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 2,
      },
    },
  })

if (!isReusingExistingClient) {
  globalThis.__ourMoneyQueryClientConstructCount = (globalThis.__ourMoneyQueryClientConstructCount ?? 0) + 1
}

// TEMPORARY — spinner-flash-on-tab-focus investigation. See
// lib/debug/spinnerDiagnostics.ts's header comment; remove alongside it.
// Read by app/_layout.tsx to log alongside RootLayout's own mount.
export const queryClientDiagnosticInstanceId = globalThis.__ourMoneyQueryClientConstructCount ?? 0

if (!globalThis.__ourMoneyQueryClient) {
  globalThis.__ourMoneyQueryClient = queryClient

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
  //
  // Guarded behind the same "first real construction only" check as the
  // client itself: re-registering this on every Fast Refresh cycle would
  // otherwise leak one AppState subscription per cycle.
  if (Platform.OS !== 'web') {
    focusManager.setEventListener((handleFocus) => {
      const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        handleFocus(state === 'active')
      })
      return () => subscription.remove()
    })
  }
}
