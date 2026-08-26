// An authenticated-but-no-household sibling of dev/designQaClient.ts, for
// the release-readiness pass's auth/onboarding verification gap — see
// designQaSignedOutClient.ts's own header for the fuller context. The
// default DESIGN_QA=1 fixture's household_members table already has rows
// for the signed-in user, so the real auth guard (features/auth/hooks/
// useAuthGuard.ts) always routed straight past onboarding to Dashboard.
//
// Enabled with `DESIGN_QA=onboarding` (see metro.config.js's resolver
// hook). Session is real (borrowed from the same createSession shape the
// default fixture uses); `household_members` starts empty so
// useHasHousehold resolves false and the guard sends the session to
// /onboarding/create-household on its own, the same way it would for a
// genuinely new user.
//
// create_household's RPC is faked as a real success (not just rendering
// the form) so the household-creation → invite-partner handoff — which
// runs through a Zustand store (store/householdStore.ts), not this
// fixture's own tables — can be exercised end to end. Nothing here writes
// anywhere real; `rpc()` below is a local, in-memory stand-in, same as
// every other table in this harness.

import { createBuilder, createSession } from './designQaEngine'

const HOUSEHOLD = 'hh-onboarding-1'
const USER = 'user-1'

const TABLES: Record<string, Record<string, unknown>[]> = {
  household_members: [],
  households: [],
  profiles: [
    { id: USER, display_name: 'נועם לוי', avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  // useCreateInvitation does a plain `.from('invitations').insert(...)
  // .select('token').single()`, not an RPC — the shared builder's `insert`
  // is a no-op chain link (it doesn't actually append), so this fixed row
  // is what `.single()` resolves to, standing in for whatever real token
  // Postgres's own DEFAULT would have generated.
  invitations: [{ id: 'inv-1', household_id: HOUSEHOLD, invited_by: USER, token: 'design-qa-invite-token', created_at: '2026-01-01T00:00:00Z' }],
}

const builder = createBuilder(TABLES, (_table, _select, row) => row)
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
  rpc: (fn: string, args?: Record<string, unknown>) => {
    if (fn === 'create_household') {
      const name = typeof args?.p_name === 'string' ? args.p_name.trim() : ''
      if (!name) return Promise.resolve({ data: { ok: false, error: 'invalid_name' }, error: null })
      return Promise.resolve({ data: { ok: true, household_id: HOUSEHOLD }, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  },
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => Promise.resolve('ok') }
    return ch
  },
  removeChannel: () => Promise.resolve('ok'),
}
