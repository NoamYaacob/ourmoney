// Local, development-only "Design QA" data source — swapped in for
// lib/supabase/client.ts by metro.config.js's resolver hook when
// DESIGN_QA=1, so the app's real screens/hooks/engines can be rendered and
// screenshotted against `OurMoney - Desktop.dc.html` / `OurMoney -
// Mobile.dc.html` without touching Supabase at all.
//
// Every name, amount, date and category below is taken directly from those
// two Design files (the same "משפחת לוי" household, "שופרסל דיל", "ארנונה
// דו־חודשית", "מחסני רהיטים" sofa/fridge instalments, etc. the mockups
// themselves show) — the point is that a screenshot taken under DESIGN_QA=1
// should be comparable to the mockup, not just "some data." Nothing here is
// or has ever been prefixed with an implementation/debug marker; this file
// is reviewed the same as any other product copy.
//
// Committed on purpose (see docs/DESIGN_QA_MODE.md) — the previous version
// of this file lived at .qa/fixtureClient.ts, gitignored and rebuilt by
// hand every session, which made it easy to drift and impossible for
// anyone else to reuse. This is the same content, given a permanent,
// documented home.
//
// Never imported by the app itself, never wired into any production build
// command, and only reachable at all when a developer explicitly sets
// DESIGN_QA=1 — see metro.config.js's resolver hook and
// docs/DESIGN_QA_MODE.md for exactly how and when.
//
// Stubs the CLIENT rather than the hooks on purpose: every screen then runs
// its real hooks, real TanStack Query wiring and real engines over
// realistically-shaped rows, so what gets screenshotted is the actual
// product with data, not a re-implementation of it.

// Query-engine plumbing (the permissive PostgrestFilterBuilder stand-in,
// join embedding, session shape) lives in dev/designQaEngine.ts, shared with
// the signed-out/onboarding/empty/stress fixture variants added for the
// release-readiness pass — see that file's own header for why.
import { createBuilder, createSession } from './designQaEngine'

const HOUSEHOLD = 'hh-1'
const USER = 'user-1'
const PARTNER = 'user-2'

// Anchored so "today" always sits mid-month with events either side,
// matching the mockups' own late-August framing.
const now = new Date()
const Y = now.getFullYear()
const M = now.getMonth() + 1
const pad = (n: number) => String(n).padStart(2, '0')
const d = (day: number, monthOffset = 0) => {
  const dt = new Date(Y, M - 1 + monthOffset, day)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
const monthStart = `${Y}-${pad(M)}-01`
const TODAY = d(now.getDate())

// Column-for-column with types/database.ts's accounts Row — the harness is
// only useful if the app's own engines accept it. The earlier shape invented
// `is_archived`/`initial_balance_agorot` and typed the current account
// 'bank', so isEligibleCashAccount() rejected every account and the whole
// forecast started from zero.
const ACCOUNTS = [
  { id: 'acc-bank', household_id: HOUSEHOLD, owner_id: null, name: 'עו״ש לאומי', type: 'checking', currency: 'ILS', balance_agorot: 1_248_050, color: null, icon: null, is_active: true, include_in_total: true, billing_cycle_day: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'acc-cash', household_id: HOUSEHOLD, owner_id: null, name: 'מזומן', type: 'cash', currency: 'ILS', balance_agorot: 62_000, color: null, icon: null, is_active: true, include_in_total: true, billing_cycle_day: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'acc-card', household_id: HOUSEHOLD, owner_id: null, name: 'ויזה כאל', type: 'credit_card', currency: 'ILS', balance_agorot: 0, color: null, icon: null, is_active: true, include_in_total: true, billing_cycle_day: 10, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'acc-savings', household_id: HOUSEHOLD, owner_id: null, name: 'קרן השתלמות', type: 'savings', currency: 'ILS', balance_agorot: 4_320_000, color: null, icon: null, is_active: true, include_in_total: true, billing_cycle_day: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]

// Column-for-column with types/database.ts's categories Row. The earlier
// shape carried a `kind` field the schema does not have and omitted
// `is_active`/`sort_order`, so useCategories's `.eq('is_active', true)`
// returned nothing and the budget donut's legend rendered nameless.
const CATEGORIES = [
  { id: 'cat-super', household_id: HOUSEHOLD, name_he: 'סופרמרקט', name_en: null, icon: '🛒', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 0, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-rest', household_id: HOUSEHOLD, name_he: 'מסעדות ובתי קפה', name_en: null, icon: '☕', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 1, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-car', household_id: HOUSEHOLD, name_he: 'דלק ורכב', name_en: null, icon: '🚗', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 2, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-fun', household_id: HOUSEHOLD, name_he: 'פנאי ובידור', name_en: null, icon: '🎬', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 3, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-home', household_id: HOUSEHOLD, name_he: 'דיור', name_en: null, icon: '🏠', color: '#0f6b5c', is_system: true, is_active: true, is_income: false, parent_id: null, sort_order: 4, created_at: '2026-01-01T00:00:00Z' },
  { id: 'cat-salary', household_id: HOUSEHOLD, name_he: 'משכורת', name_en: null, icon: '💼', color: '#0f6b5c', is_system: true, is_active: true, is_income: true, parent_id: null, sort_order: 5, created_at: '2026-01-01T00:00:00Z' },
]

let txnSeq = 0
const txn = (o: Record<string, unknown>) => ({
  id: `txn-${++txnSeq}`,
  household_id: HOUSEHOLD,
  account_id: 'acc-card',
  category_id: 'cat-super',
  description: '',
  merchant: null,
  amount_agorot: -10_000,
  txn_date: TODAY,
  is_shared: true,
  is_excluded: false,
  transfer_id: null,
  recurring_id: null,
  installment_plan_id: null,
  installment_index: null,
  paid_by: USER,
  created_by: USER,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  version: 1,
  categorization_source: null,
  category_rule_id: null,
  ...o,
})

const TRANSACTIONS = [
  txn({ description: 'שופרסל דיל', merchant: 'שופרסל', amount_agorot: -41_280, txn_date: d(now.getDate() - 1), category_id: 'cat-super' }),
  txn({ description: 'קפה נמרוד', amount_agorot: -9_600, txn_date: d(now.getDate() - 1), category_id: 'cat-rest', is_shared: false }),
  txn({ description: 'פז יעלון', amount_agorot: -28_740, txn_date: d(now.getDate() - 2), category_id: 'cat-car' }),
  // Elapsed instalments, as generate_installment_transactions() would have
  // already materialized them. Without these the forecaster resumes from
  // index 1 and the cash-flow screen fills with overdue duplicates.
  ...[1, 2, 3, 4, 5].map((index) =>
    txn({ description: 'מחסני רהיטים', amount_agorot: -59_900, txn_date: d(10, index - 5), category_id: null, installment_plan_id: 'ip-sofa', installment_index: index })
  ),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) =>
    txn({ description: 'מקרר, א.ל.מ חשמל', amount_agorot: -40_000, txn_date: d(10, index - 9), category_id: null, installment_plan_id: 'ip-fridge', installment_index: index })
  ),
  txn({ description: 'רמי לוי', merchant: 'רמי לוי', amount_agorot: -32_450, txn_date: d(now.getDate() - 4), category_id: 'cat-super' }),
  txn({ description: 'סינמה סיטי', amount_agorot: -14_000, txn_date: d(now.getDate() - 5), category_id: 'cat-fun' }),
  txn({ description: 'ארומה', amount_agorot: -4_800, txn_date: d(now.getDate() - 6), category_id: 'cat-rest' }),
  txn({ description: 'משכורת נועם', amount_agorot: 1_284_000, txn_date: d(1), category_id: 'cat-salary', account_id: 'acc-bank' }),
  txn({ description: 'משכורת דנה', amount_agorot: 1_395_000, txn_date: d(1), category_id: 'cat-salary', account_id: 'acc-bank' }),
  txn({ description: 'שכר דירה', amount_agorot: -620_000, txn_date: d(2), category_id: 'cat-home', account_id: 'acc-bank' }),
  txn({ description: 'ויקטורי', amount_agorot: -18_900, txn_date: d(8), category_id: 'cat-super' }),
  txn({ description: 'תדלוק סונול', amount_agorot: -24_000, txn_date: d(9), category_id: 'cat-car' }),
  txn({ description: 'מסעדת ליבירה', amount_agorot: -38_600, txn_date: d(10), category_id: 'cat-rest' }),
  txn({ description: 'העברה לחיסכון', amount_agorot: -200_000, txn_date: d(5), category_id: null, account_id: 'acc-bank', transfer_id: 'tr-1' }),
  txn({ description: 'העברה לחיסכון', amount_agorot: 200_000, txn_date: d(5), category_id: null, account_id: 'acc-savings', transfer_id: 'tr-1' }),
  txn({ description: 'סופר פארם', amount_agorot: -7_650, txn_date: d(now.getDate() - 3), category_id: null }),
  txn({ description: 'חניון עזריאלי', amount_agorot: -3_200, txn_date: d(now.getDate() - 3), category_id: null }),
]

const TABLES: Record<string, Record<string, unknown>[]> = {
  households: [{ id: HOUSEHOLD, name: 'משפחת לוי', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER }],
  household_members: [
    { id: 'hm-1', household_id: HOUSEHOLD, user_id: USER, role: 'owner', created_at: '2026-01-01T00:00:00Z', profiles: { id: USER, display_name: 'נועם לוי', avatar_url: null } },
    { id: 'hm-2', household_id: HOUSEHOLD, user_id: PARTNER, role: 'member', created_at: '2026-01-01T00:00:00Z', profiles: { id: PARTNER, display_name: 'דנה לוי', avatar_url: null } },
  ],
  profiles: [
    { id: USER, display_name: 'נועם לוי', avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: PARTNER, display_name: 'דנה לוי', avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  // Product-quality audit finding: this fixture used a `match_type`/
  // `match_value`/`priority`/`version` shape that has never matched the
  // real `category_rules` table (`field`/`operator`/`value`/`is_active`/
  // `is_case_sensitive`/`sort_order` — see types/database.ts) — settings/
  // categories.tsx reads `rule.field`/`rule.operator` directly into a
  // dynamic t(`categories.rules.field.${rule.field}`) lookup, so the stale
  // shape rendered raw, untranslated keys ("categories.rules.field.
  // undefined") instead of "אם תיאור מכיל". Corrected to the real shape.
  category_rules: [
    {
      id: 'rule-1',
      household_id: HOUSEHOLD,
      category_id: 'cat-super',
      field: 'merchant_name',
      operator: 'contains',
      value: 'שופרסל',
      is_active: true,
      is_case_sensitive: false,
      sort_order: 1,
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  transactions: TRANSACTIONS,
  transfers: [{ id: 'tr-1', household_id: HOUSEHOLD, from_account_id: 'acc-bank', to_account_id: 'acc-savings', amount_agorot: 200_000, txn_date: d(5), description: 'העברה לחיסכון', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER }],
  budgets: [{ id: 'bud-1', household_id: HOUSEHOLD, period_start: monthStart, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1 }],
  budget_allocations: [
    { id: 'ba-1', budget_id: 'bud-1', category_id: 'cat-super', amount_agorot: 450_000 },
    { id: 'ba-2', budget_id: 'bud-1', category_id: 'cat-rest', amount_agorot: 90_000 },
    { id: 'ba-3', budget_id: 'bud-1', category_id: 'cat-car', amount_agorot: 140_000 },
    { id: 'ba-4', budget_id: 'bud-1', category_id: 'cat-fun', amount_agorot: 80_000 },
  ],
  planned_obligations: [
    { id: 'ob-1', household_id: HOUSEHOLD, name: 'ארנונה דו־חודשית', amount_agorot: 122_400, due_date: d(28), status: 'upcoming', category_id: 'cat-home', account_id: 'acc-bank', is_shared: true, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
    { id: 'ob-2', household_id: HOUSEHOLD, name: 'טסט ואגרת רכב', amount_agorot: 118_000, due_date: d(4, 1), status: 'upcoming', category_id: 'cat-car', account_id: 'acc-bank', is_shared: true, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
    { id: 'ob-3', household_id: HOUSEHOLD, name: 'ביטוח בריאות שנתי', amount_agorot: 106_600, due_date: d(12, 1), status: 'upcoming', category_id: null, account_id: 'acc-bank', is_shared: false, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
  ],
  recurring_transactions: [
    { id: 'rc-1', household_id: HOUSEHOLD, description: 'משכנתא לאומי', amount_agorot: -624_000, frequency: 'monthly', day_of_month: 10, next_due_date: d(10, M === now.getMonth() + 1 && now.getDate() > 10 ? 1 : 0), is_active: true, category_id: 'cat-home', account_id: 'acc-bank', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-2', household_id: HOUSEHOLD, description: 'גן ילדים עדן', amount_agorot: -215_000, frequency: 'monthly', day_of_month: 1, next_due_date: d(1, 1), is_active: true, category_id: null, account_id: 'acc-bank', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-3', household_id: HOUSEHOLD, description: 'חדר כושר', amount_agorot: -19_900, frequency: 'monthly', day_of_month: 15, next_due_date: d(15, 1), is_active: true, category_id: 'cat-fun', account_id: 'acc-card', is_shared: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-4', household_id: HOUSEHOLD, description: 'ביטוח רכב', amount_agorot: -38_000, frequency: 'monthly', day_of_month: 20, next_due_date: d(20), is_active: true, category_id: 'cat-car', account_id: 'acc-bank', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
  ],
  savings_goals: [
    { id: 'sg-1', household_id: HOUSEHOLD, name: 'חופשה ביוון', target_agorot: 1_200_000, current_agorot: 740_000, target_date: d(1, 6), is_completed: false, account_id: null, progress_source: 'manual', icon: 'airplane', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
    { id: 'sg-2', household_id: HOUSEHOLD, name: 'קרן חירום', target_agorot: 3_000_000, current_agorot: 1_150_000, target_date: null, is_completed: false, account_id: null, progress_source: 'manual', icon: 'shield', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
  ],
  installment_plans: [
    { id: 'ip-sofa', household_id: HOUSEHOLD, description: 'ספה, מחסני רהיטים', total_agorot: 718_800, installment_count: 12, monthly_agorot: 59_900, first_charge_date: d(10, -4), category_id: null, account_id: 'acc-card', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, merchant: 'מחסני רהיטים', purchase_date: d(18, -4) },
    { id: 'ip-fridge', household_id: HOUSEHOLD, description: 'מקרר, א.ל.מ חשמל', total_agorot: 480_000, installment_count: 12, monthly_agorot: 40_000, first_charge_date: d(10, -8), category_id: null, account_id: 'acc-card', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, merchant: 'א.ל.מ חשמל', purchase_date: d(12, -8) },
  ],
  invitations: [],
}

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
const HOUSEHOLD_ROW = { id: HOUSEHOLD, name: 'משפחת לוי', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER }

// The real queries request embedded resources (`households(*)`,
// `categories(name_he, icon)`); PostgREST returns those as nested objects,
// so the fixture has to as well or screens render nameless rows.
function withJoins(table: string, select: string, row: Record<string, unknown>) {
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
