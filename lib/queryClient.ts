import { AppState, Platform, type AppStateStatus } from 'react-native'
import { QueryClient, focusManager } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'

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
// and off for as long as Fast Refresh keeps re-triggering.
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
}

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

if (!globalThis.__ourMoneyQueryClient) {
  globalThis.__ourMoneyQueryClient = queryClient

  // Wires focusManager on BOTH platforms now (previously native-only — see
  // git history for that original, narrower comment). TanStack Query's own
  // default web listener (a bare 'visibilitychange' → refetch, no session
  // check) is exactly the root cause of the intermittent "משהו השתבש. נסו
  // שוב" reported on Home: a browser tab backgrounded long enough for the
  // Supabase access token to cross its expiry margin, then brought back to
  // the foreground.
  //
  // What actually happens, confirmed against the installed
  // @supabase/auth-js source (GoTrueClient#getSession → #_useSession →
  // #__loadSession):
  //   1. The tab is hidden. Chrome (and other browsers) throttle a hidden
  //      tab's JS timers to roughly once a minute, sometimes less — so
  //      supabase-js's own background token-refresh timer can fall well
  //      behind while nothing is watching.
  //   2. The tab becomes visible again. The DOM fires 'visibilitychange'.
  //      TanStack's default web focusManager listener calls its callback
  //      with no argument, which synchronously — in the same tick, before
  //      any refresh has a chance to land — marks every observer "focused"
  //      and triggers refetches for every stale query.
  //   3. useSafeToSpend's six queries (accounts, balances, planned
  //      obligations, recurring templates, installment plans, materialized
  //      counts — see that hook) all fire in that same tick, still carrying
  //      whatever access token supabase-js had in memory. If it had expired
  //      while hidden, PostgREST returns 401 for all six.
  //   4. `retry: 2` above retries against that identical expired token —
  //      nothing between attempts causes a refresh — so all three attempts
  //      fail the same way and the query settles into a real `error` state.
  //      useSafeToSpend unions all six `error`s into one, which is what the
  //      Home hero renders as `cashFlow.errors.generic`.
  //   5. The error clears the next time a focus-triggered refetch happens
  //      to land after the token had already refreshed by then (matching
  //      the report: "disappears after returning to the tab") — and
  //      reappears on the next long-enough background/expiry cycle.
  //
  // `getSession()` is the fix, not a longer retry count (which the root
  // cause makes clear would just retry with the same bad token). Per
  // `__loadSession`'s own logic, if the stored session is within
  // EXPIRY_MARGIN_MS of expiring, `getSession()` awaits the refresh call
  // before it resolves, and updates the client's in-memory/stored session
  // before returning — so awaiting it once here, before ever telling
  // TanStack Query the window is focused, guarantees every query this
  // triggers sees a valid token on its very first request. Wrapped in
  // `Promise.resolve(...)` so a caller — including this file's own tests,
  // which mock `getSession` as a bare unconfigured `jest.fn()` — need not
  // return a real Promise for this to still resolve correctly.
  //
  // Native's own refresh restart (lib/supabase/client.ts's AppState
  // listener calling `startAutoRefresh()`) has exactly the same race: it is
  // fired without being awaited, right alongside this same focus callback.
  // Awaiting `getSession()` here fixes both platforms with one guard,
  // rather than trusting two independently-timed listeners to land in the
  // right order.
  //
  // "Becoming inactive" needs none of this — there is nothing to await
  // before telling TanStack Query to stop treating the window as focused,
  // and waiting would only delay that.
  //
  // Guarded behind the same "first real construction only" check as the
  // client itself: re-registering this on every Fast Refresh cycle would
  // otherwise leak one subscription per cycle.
  focusManager.setEventListener((handleFocus) => {
    const onBecameActive = () => {
      void Promise.resolve(supabase.auth.getSession()).finally(() => handleFocus(true))
    }

    if (Platform.OS !== 'web') {
      const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
        if (state === 'active') {
          onBecameActive()
        } else {
          handleFocus(false)
        }
      })
      return () => subscription.remove()
    }

    // document is unavailable in a non-DOM web-adjacent environment (SSR,
    // certain test runners) — no listener to wire in that case, same as
    // TanStack's own default setup guards on `window`.
    if (typeof document === 'undefined') return undefined

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onBecameActive()
      } else {
        handleFocus(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange, false)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  })
}
