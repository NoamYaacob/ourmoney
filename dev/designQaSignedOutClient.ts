// A signed-out sibling of dev/designQaClient.ts, for the release-readiness
// pass's auth/onboarding verification gap: the default DESIGN_QA=1 fixture
// always reports an authenticated session (see designQaClient.ts's own
// SESSION), so sign-in/sign-up/forgot-password redirected straight past
// themselves to Dashboard via the real auth guard (features/auth/hooks/
// useAuthGuard.ts) — there was no local, credential-free way to actually
// see those screens.
//
// Enabled with `DESIGN_QA=signedout` (see metro.config.js's resolver hook)
// — same dev-only opt-in as the default fixture, never wired into any
// production build command, never touching real Supabase or real
// credentials. No household-scoped tables are needed here at all: with no
// session, the auth guard sends every route straight to (auth) before any
// financial screen's own hooks would run.
//
// signInWithPassword/signUp deliberately do NOT fake a successful login —
// this fixture exists to look at the (auth) screens themselves (copy,
// layout, validation, loading/error states), not to simulate a working
// backend behind them. Returning a clearly-fake, distinctly-worded error
// lets the form's own error-rendering be inspected honestly, instead of
// silently pretending a real sign-in occurred.

import { createBuilder } from './designQaEngine'

const PREVIEW_ONLY_ERROR = { message: 'תצוגה מקדימה בלבד — לא ניתן להתחבר במצב זה', status: 400 }

const builder = createBuilder({}, (_table, _select, row) => row)

export const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
      setTimeout(() => cb('SIGNED_OUT', null), 0)
      return { data: { subscription: { unsubscribe() {} } } }
    },
    signInWithPassword: () => Promise.resolve({ data: { session: null, user: null }, error: PREVIEW_ONLY_ERROR }),
    signUp: () => Promise.resolve({ data: { session: null, user: null }, error: PREVIEW_ONLY_ERROR }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
    setSession: () => Promise.resolve({ data: { session: null }, error: null }),
    exchangeCodeForSession: () => Promise.resolve({ data: { session: null }, error: null }),
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  },
  from: (table: string) => builder(table),
  rpc: () => Promise.resolve({ data: null, error: null }),
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => Promise.resolve('ok') }
    return ch
  },
  removeChannel: () => Promise.resolve('ok'),
}
