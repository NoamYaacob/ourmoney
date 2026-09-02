// CP8E — Financial Pulse, NO CHANGE state: identical household/financial
// fixture to DESIGN_QA=1, with a real previous financial_pulse_snapshots
// row whose safe_to_spend_agorot EXACTLY equals today's real, currently-
// computed figure. Financial Pulse must render nothing here (section 10's
// "calmer option": omit entirely rather than a hollow "לא השתנה כלום") —
// this mode exists specifically to prove that restraint on a real,
// resolved comparison (not merely a first visit where no comparison exists
// at all — see DESIGN_QA=pulse-first for that distinct case).
//
// Never imported by the app itself — only resolved when a developer
// explicitly sets `DESIGN_QA=pulse-nochange` (see metro.config.js).

import { createBuilder, createSession } from './designQaEngine'
import { TABLES as DEFAULT_TABLES, withJoins, USER, HOUSEHOLD } from './designQaClient'

const CURRENT_SAFE_TO_SPEND_AGOROT = 1_698_600 // DESIGN_QA=1's own real, engine-computed figure

const TABLES: Record<string, Record<string, unknown>[]> = {
  ...DEFAULT_TABLES,
  financial_pulse_snapshots: [
    {
      household_id: HOUSEHOLD,
      user_id: USER,
      safe_to_spend_agorot: CURRENT_SAFE_TO_SPEND_AGOROT,
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
