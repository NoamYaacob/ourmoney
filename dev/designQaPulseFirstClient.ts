// CP8E — Financial Pulse, FIRST VISIT state: a real household (identical
// fixture to DESIGN_QA=1) with NO financial_pulse_snapshots row for the
// signed-in user yet. Financial Pulse must render nothing here — there is
// no "last time" to compare against, and section 8's own rule is explicit:
// never show "אין שינוי" on a first visit, just omit the section entirely.
//
// Never imported by the app itself — only resolved when a developer
// explicitly sets `DESIGN_QA=pulse-first` (see metro.config.js).

import { createBuilder, createSession } from './designQaEngine'
import { TABLES as DEFAULT_TABLES, withJoins, USER } from './designQaClient'

const TABLES: Record<string, Record<string, unknown>[]> = {
  ...DEFAULT_TABLES,
  financial_pulse_snapshots: [],
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
