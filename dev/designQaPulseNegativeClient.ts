// CP8E — Financial Pulse, NEGATIVE CHANGE state: identical household/
// financial fixture to DESIGN_QA=1, with a real previous
// financial_pulse_snapshots row showing a HIGHER Safe-to-Spend than today's
// real, currently-computed figure — so the primary comparison shows "X
// less available, since last time," exactly this checkpoint's own brief
// example shape.
//
// The previous figure (₪17,606.00) is DESIGN_QA=1's own real, engine-
// computed Safe-to-Spend (₪16,986.00) plus a fixed ₪620.00 — chosen to
// match this checkpoint's own product-contract example ("₪620 פחות
// פנויים") as closely as possible while still being a real delta against
// the real current figure, not a fabricated one.
//
// Never imported by the app itself — only resolved when a developer
// explicitly sets `DESIGN_QA=pulse-negative` (see metro.config.js).

import { createBuilder, createSession } from './designQaEngine'
import { TABLES as DEFAULT_TABLES, withJoins, USER, HOUSEHOLD } from './designQaClient'

const PREVIOUS_SAFE_TO_SPEND_AGOROT = 1_698_600 + 62_000 // ₪16,986.00 (current) + ₪620.00

const TABLES: Record<string, Record<string, unknown>[]> = {
  ...DEFAULT_TABLES,
  financial_pulse_snapshots: [
    {
      household_id: HOUSEHOLD,
      user_id: USER,
      safe_to_spend_agorot: PREVIOUS_SAFE_TO_SPEND_AGOROT,
      captured_at: '2026-08-10T09:00:00.000Z',
    },
  ],
}

const builder = createBuilder(TABLES, withJoins)
const SESSION = createSession(USER, 'noam@example.com')

export const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    getUser: () => Promise.resolve({ data: { user: SESSION.user }, error: null }),
    onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
      setTimeout(() => cb('SIGNED_IN', SESSION), 0)
      return { data: { subscription: { unsubscribe() {} } } }
    },
    signInWithPassword: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    signUp: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
    setSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    exchangeCodeForSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
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
