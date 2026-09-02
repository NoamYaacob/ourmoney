// An authenticated, has-a-household, but zero-financial-data sibling of
// dev/designQaClient.ts — for the release-readiness pass's first-time-user
// verification (section 5): what a household sees the moment onboarding
// finishes, before adding a single account, transaction, budget, recurring
// charge, instalment, or savings goal. `DESIGN_QA=onboarding` (no household
// at all) covers the onboarding screens themselves; this covers everything
// after that, while the household is still empty.
//
// Categories are seeded here (the app auto-seeds default categories for
// every new household at creation time — this is not "financial data" the
// user entered), everything else is empty.
//
// Never imported by the app itself — only resolved when a developer
// explicitly sets `DESIGN_QA=empty` on their own machine (see
// metro.config.js).

import { createBuilder, createSession } from './designQaEngine'

const HOUSEHOLD = 'hh-empty-1'
const USER = 'user-1'

const CATEGORIES = [
  { id: 'cat-super', household_id: HOUSEHOLD, name_he: 'סופרמרקט', name_en: null, icon: '🛒', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 0, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-rest', household_id: HOUSEHOLD, name_he: 'מסעדות ובתי קפה', name_en: null, icon: '☕', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 1, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-car', household_id: HOUSEHOLD, name_he: 'דלק ורכב', name_en: null, icon: '🚗', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 2, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-fun', household_id: HOUSEHOLD, name_he: 'פנאי ובידור', name_en: null, icon: '🎬', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 3, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-home', household_id: HOUSEHOLD, name_he: 'דיור', name_en: null, icon: '🏠', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 4, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-salary', household_id: HOUSEHOLD, name_he: 'משכורת', name_en: null, icon: '💼', color: '#0f6b5c', is_system: true, is_active: true, is_income: true, parent_id: null, sort_order: 5, created_at: '2026-01-01T00:00:00Z' },
]

const TABLES: Record<string, Record<string, unknown>[]> = {
  households: [{ id: HOUSEHOLD, name: 'משפחת ישראלי', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER }],
  household_members: [
    { id: 'hm-1', household_id: HOUSEHOLD, user_id: USER, role: 'owner', created_at: '2026-01-01T00:00:00Z', profiles: { id: USER, display_name: 'נועם ישראלי', avatar_url: null } },
  ],
  profiles: [{ id: USER, display_name: 'נועם ישראלי', avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
  accounts: [],
  categories: CATEGORIES,
  category_rules: [],
  transactions: [],
  transfers: [],
  budgets: [],
  budget_allocations: [],
  planned_obligations: [],
  recurring_transactions: [],
  savings_goals: [],
  installment_plans: [],
  invitations: [],
}

const HOUSEHOLD_ROW = TABLES.households![0]!
const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

function withJoins(_table: string, select: string, row: Record<string, unknown>) {
  if (select.includes('households(')) return { ...row, households: HOUSEHOLD_ROW }
  if (select.includes('categories(')) {
    const c = CATEGORY_BY_ID[row.category_id as string]
    return { ...row, categories: c ? { name_he: c.name_he, icon: c.icon } : null }
  }
  return row
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
