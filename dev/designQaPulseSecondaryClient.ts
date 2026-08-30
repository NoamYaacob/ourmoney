// CP8E — Financial Pulse, SECONDARY CHANGE state: the stress household
// (DESIGN_QA=stress's own "משפחת כהן־לוי" fixture, 130+ procedurally-
// generated transactions), with a real previous financial_pulse_snapshots
// row captured well before "today." No new transaction rows are added
// here — this reuses whichever of the stress fixture's own already-
// existing, already-tested recurring-price-increase detections
// (usePriceIncreaseDetections — the same detector Attention alerts already
// use, including its own committed Netflix history, rc-5) land after this
// row's captured_at; computeFinancialPulse.ts caps the display at the 2
// most recent, per this checkpoint's own "up to a FEW secondary changes"
// product contract. Per this checkpoint's own "start narrow, no ambiguous
// historical reconstruction" instruction: recurring-price-increase is the
// ONE existing secondary-change source that needs no new persisted state
// to know it's "since last time" — a detection's own detectedAt is
// compared directly against this row's captured_at.
//
// Never imported by the app itself — only resolved when a developer
// explicitly sets `DESIGN_QA=pulse-secondary` (see metro.config.js).

import { createBuilder, createSession } from './designQaEngine'
import { TABLES as DEFAULT_TABLES, withJoins, USER, HOUSEHOLD } from './designQaStressClient'

const TABLES: Record<string, Record<string, unknown>[]> = {
  ...DEFAULT_TABLES,
  financial_pulse_snapshots: [
    {
      household_id: HOUSEHOLD,
      user_id: USER,
      // Set to the same figure the stress household's own real,
      // currently-computed Safe-to-Spend resolves to as of this fixture's
      // committed state — a true "no material primary change" baseline —
      // so this screenshot demonstrates the secondary item on its own,
      // uncomplicated by an unrelated primary headline. If the stress
      // fixture's own financial data changes in the future, this constant
      // must be re-verified against the real engine output, not adjusted
      // to "look right."
      safe_to_spend_agorot: 9_693_575,
      // Before the Netflix increase's own 2026-08-03 detection date, so it
      // counts as "since last time" — after the three ₪45.90 baseline
      // months (May/June/July), before the current ₪54.90 charge.
      captured_at: '2026-07-25T09:00:00.000Z',
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
