// A high-volume sibling of dev/designQaClient.ts — for the release-
// readiness pass's high-data stress test (section 6): 10 accounts, 20+
// categories, 100+ transactions, several recurring charges, several
// instalment plans, several savings goals. Generated procedurally (real
// bank-export-scale households do not have 6 categories and 17
// transactions) rather than hand-listed, but every row still goes through
// the same real hooks/engines/screens as every other DESIGN_QA mode — the
// point is to see how the actual product behaves once a household has been
// used for a year, not a re-implementation of it.
//
// Never imported by the app itself — only resolved when a developer
// explicitly sets `DESIGN_QA=stress` on their own machine (see
// metro.config.js).

import { createBuilder, createSession } from './designQaEngine'

const HOUSEHOLD = 'hh-stress-1'
const USER = 'user-1'
const PARTNER = 'user-2'

const now = new Date()
const Y = now.getFullYear()
const M = now.getMonth() + 1
const pad = (n: number) => String(n).padStart(2, '0')
const d = (day: number, monthOffset = 0) => {
  const dt = new Date(Y, M - 1 + monthOffset, day)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}
const monthStart = `${Y}-${pad(M)}-01`

const CATEGORY_DEFS: [string, string, string, boolean][] = [
  ['super', 'סופרמרקט', '🛒', false],
  ['rest', 'מסעדות ובתי קפה', '☕', false],
  ['car', 'דלק ורכב', '🚗', false],
  ['fun', 'פנאי ובידור', '🎬', false],
  ['home', 'דיור', '🏠', false],
  ['salary', 'משכורת', '💼', true],
  ['health', 'בריאות', '💊', false],
  ['clothes', 'ביגוד והנעלה', '👕', false],
  ['pets', 'חיות מחמד', '🐕', false],
  ['kids', 'ילדים', '🧸', false],
  ['edu', 'חינוך', '📚', false],
  ['gifts', 'מתנות', '🎁', false],
  ['travel', 'נסיעות וטיסות', '✈️', false],
  ['subs', 'מנויים ושירותים', '📱', false],
  ['insurance', 'ביטוחים', '🛡️', false],
  ['tech', 'אלקטרוניקה', '💻', false],
  ['sport', 'ספורט וכושר', '🏋️', false],
  ['beauty', 'טיפוח ויופי', '💄', false],
  ['charity', 'תרומות', '🤲', false],
  ['other-income', 'הכנסות אחרות', '💰', true],
  ['misc', 'שונות', '🔖', false],
]
const CATEGORIES = CATEGORY_DEFS.map(([slug, name, icon, isIncome], i) => ({
  id: `cat-${slug}`,
  household_id: HOUSEHOLD,
  name_he: name,
  name_en: null,
  icon,
  color: '#0f6b5c',
  is_system: i < 6,
  is_active: true,
  is_income: isIncome,
  parent_id: null,
  sort_order: i,
  created_at: '2026-01-01T00:00:00Z',
}))
const SPEND_CATEGORY_IDS = CATEGORIES.filter((c) => !c.is_income).map((c) => c.id)

const ACCOUNT_DEFS: [string, string, string, number, number | null][] = [
  ['bank-main', 'עו״ש לאומי', 'checking', 1_248_050, null],
  ['bank-joint', 'עו״ש משותף הפועלים', 'checking', 384_200, null],
  ['cash', 'מזומן', 'cash', 62_000, null],
  ['card-visa', 'ויזה כאל', 'credit_card', 0, 10],
  ['card-master', 'מאסטרקארד ישראכרט', 'credit_card', 0, 5],
  ['savings-keren', 'קרן השתלמות', 'savings', 4_320_000, null],
  ['savings-pension', 'חיסכון פנסיוני', 'savings', 18_600_000, null],
  ['savings-kids', 'חיסכון לילדים', 'savings', 920_000, null],
  ['brokerage', 'תיק השקעות', 'investment', 5_150_000, null],
  ['old-cash', 'ארנק ישן', 'cash', 4_300, null],
]
const ACCOUNTS = ACCOUNT_DEFS.map(([slug, name, type, balance, cycleDay]) => ({
  id: `acc-${slug}`,
  household_id: HOUSEHOLD,
  owner_id: null,
  name,
  type,
  currency: 'ILS',
  balance_agorot: balance,
  color: null,
  icon: null,
  is_active: true,
  include_in_total: true,
  billing_cycle_day: cycleDay,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}))
const CASH_ACCOUNT_IDS = ['acc-bank-main', 'acc-bank-joint', 'acc-cash']
const CARD_ACCOUNT_IDS = ['acc-card-visa', 'acc-card-master']

const MERCHANTS = [
  'שופרסל דיל', 'רמי לוי', 'ויקטורי', 'סופר פארם', 'ארומה', 'קפה נמרוד', 'פז יעלון', 'סונול',
  'סינמה סיטי', 'יס פלאנט', 'זארה', 'קסטרו', 'איקאה', 'ACE', 'רוני מזון לחיות', 'טיב טעם',
  'מסעדת ליבירה', 'וולט', 'ג׳יטו', 'נטפליקס', 'ספוטיפיי', 'סלקום', 'פרטנר', 'חניון עזריאלי',
  'קופת חולים כללית', 'סופר-פארם', 'משרד הפנים', 'H&M', 'רשת KSP', 'איירפורט סיטי',
]

let txnSeq = 0
const txn = (o: Record<string, unknown>) => ({
  id: `txn-${++txnSeq}`,
  household_id: HOUSEHOLD,
  account_id: 'acc-card-visa',
  category_id: 'cat-super',
  description: '',
  merchant: null,
  amount_agorot: -10_000,
  txn_date: d(now.getDate()),
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

// Raw calendar-day offset from today, independent of the d(day, monthOffset)
// helper above (which addresses "day N of month M", not "N days ago") —
// needed here because 130 rows spread evenly need a plain day-offset walk
// back through the calendar, not a month-bucketed one.
const dateOffsetDays = (daysAgo: number) => {
  const dt = new Date(Y, M - 1, now.getDate() - daysAgo)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

// 130 generated day-to-day spend/income rows across the last ~120 days,
// deterministic (no Math.random — every row's shape is a pure function of
// its index) so re-running the export produces byte-identical fixture data.
const TRANSACTIONS: ReturnType<typeof txn>[] = []
for (let i = 0; i < 130; i++) {
  const merchant = MERCHANTS[i % MERCHANTS.length]!
  const catId = SPEND_CATEGORY_IDS[i % SPEND_CATEGORY_IDS.length]!
  const accountId = i % 5 === 0 ? CASH_ACCOUNT_IDS[i % CASH_ACCOUNT_IDS.length]! : CARD_ACCOUNT_IDS[i % 2]!
  const amount = -(1500 + ((i * 733) % 48000))
  TRANSACTIONS.push(
    txn({
      description: merchant,
      merchant,
      amount_agorot: amount,
      txn_date: dateOffsetDays(i % 120),
      category_id: catId,
      account_id: accountId,
      is_shared: i % 3 !== 0,
    })
  )
}
// Monthly salary rows for the last 4 months, two earners.
for (let m = 0; m < 4; m++) {
  TRANSACTIONS.push(txn({ description: 'משכורת נועם', amount_agorot: 1_284_000, txn_date: d(1, -m), category_id: 'cat-salary', account_id: 'acc-bank-main' }))
  TRANSACTIONS.push(txn({ description: 'משכורת דנה', amount_agorot: 1_395_000, txn_date: d(1, -m), category_id: 'cat-salary', account_id: 'acc-bank-joint' }))
}

// Already-materialized instalment transactions, one per elapsed charge
// since each plan's first_charge_date — exactly the same reason
// designQaClient.ts's own TRANSACTIONS seeds these (see its header
// comment): forecastInstallmentOccurrences.ts always resumes forecasting
// from materializedCount + 1 (computeInstallmentMaterializedCounts.ts
// counts real transaction rows carrying installment_plan_id/
// installment_index), so a plan with a first_charge_date months in the
// past and zero backing transactions gets every one of its already-elapsed
// months forecast as still-upcoming — and, since those forecast dates land
// in the past, badged "באיחור" (overdue) on Home's "מה מגיע" card. That's
// not an engine bug, it's what a genuinely under-recorded household would
// look like; a stress fixture meant to exercise "a household used for a
// year" needs the elapsed months actually recorded, same as the real
// generate_installment_transactions() flow would have produced by now.
interface ElapsedInstallmentSeed {
  planId: string
  description: string
  merchant: string
  monthlyAgorot: number
  chargeDay: number
  monthsElapsed: number
  categoryId: string | null
  accountId: string
  isShared: boolean
}
const INSTALLMENT_ELAPSED: ElapsedInstallmentSeed[] = [
  { planId: 'ip-sofa', description: 'ספה, מחסני רהיטים', merchant: 'מחסני רהיטים', monthlyAgorot: 59_900, chargeDay: 10, monthsElapsed: 4, categoryId: null, accountId: 'acc-card-visa', isShared: true },
  { planId: 'ip-fridge', description: 'מקרר, א.ל.מ חשמל', merchant: 'א.ל.מ חשמל', monthlyAgorot: 40_000, chargeDay: 10, monthsElapsed: 8, categoryId: null, accountId: 'acc-card-visa', isShared: true },
  { planId: 'ip-laptop', description: 'מחשב נייד, KSP', merchant: 'KSP', monthlyAgorot: 48_000, chargeDay: 5, monthsElapsed: 2, categoryId: 'cat-tech', accountId: 'acc-card-master', isShared: false },
  { planId: 'ip-tv', description: 'טלוויזיה, איירפורט סיטי', merchant: 'איירפורט סיטי', monthlyAgorot: 60_000, chargeDay: 20, monthsElapsed: 1, categoryId: 'cat-tech', accountId: 'acc-card-master', isShared: true },
]
for (const seed of INSTALLMENT_ELAPSED) {
  for (let index = 1; index <= seed.monthsElapsed; index++) {
    TRANSACTIONS.push(
      txn({
        description: seed.description,
        merchant: seed.merchant,
        amount_agorot: -seed.monthlyAgorot,
        txn_date: d(seed.chargeDay, index - seed.monthsElapsed - 1),
        category_id: seed.categoryId,
        account_id: seed.accountId,
        is_shared: seed.isShared,
        installment_plan_id: seed.planId,
        installment_index: index,
      })
    )
  }
}

const TABLES: Record<string, Record<string, unknown>[]> = {
  households: [{ id: HOUSEHOLD, name: 'משפחת כהן־לוי', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER }],
  household_members: [
    { id: 'hm-1', household_id: HOUSEHOLD, user_id: USER, role: 'owner', created_at: '2026-01-01T00:00:00Z', profiles: { id: USER, display_name: 'נועם כהן־לוי', avatar_url: null } },
    { id: 'hm-2', household_id: HOUSEHOLD, user_id: PARTNER, role: 'member', created_at: '2026-01-01T00:00:00Z', profiles: { id: PARTNER, display_name: 'דנה כהן־לוי', avatar_url: null } },
  ],
  profiles: [
    { id: USER, display_name: 'נועם כהן־לוי', avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: PARTNER, display_name: 'דנה כהן־לוי', avatar_url: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  accounts: ACCOUNTS,
  categories: CATEGORIES,
  category_rules: [
    { id: 'rule-1', household_id: HOUSEHOLD, category_id: 'cat-super', field: 'merchant_name', operator: 'contains', value: 'שופרסל', is_active: true, is_case_sensitive: false, sort_order: 1, created_at: '2026-01-01T00:00:00Z' },
    { id: 'rule-2', household_id: HOUSEHOLD, category_id: 'cat-subs', field: 'merchant_name', operator: 'contains', value: 'נטפליקס', is_active: true, is_case_sensitive: false, sort_order: 2, created_at: '2026-01-01T00:00:00Z' },
  ],
  transactions: TRANSACTIONS,
  transfers: [],
  budgets: [{ id: 'bud-1', household_id: HOUSEHOLD, period_start: monthStart, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1 }],
  budget_allocations: SPEND_CATEGORY_IDS.slice(0, 12).map((catId, i) => ({
    id: `ba-${i + 1}`,
    budget_id: 'bud-1',
    category_id: catId,
    amount_agorot: 60_000 + i * 15_000,
  })),
  planned_obligations: [
    { id: 'ob-1', household_id: HOUSEHOLD, name: 'ארנונה דו־חודשית', amount_agorot: 122_400, due_date: d(28), status: 'upcoming', category_id: 'cat-home', account_id: 'acc-bank-main', is_shared: true, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
    { id: 'ob-2', household_id: HOUSEHOLD, name: 'אגרת רכב', amount_agorot: 118_000, due_date: d(4, 1), status: 'upcoming', category_id: 'cat-car', account_id: 'acc-bank-main', is_shared: true, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
    { id: 'ob-3', household_id: HOUSEHOLD, name: 'ביטוח בריאות שנתי', amount_agorot: 106_600, due_date: d(12, 1), status: 'upcoming', category_id: 'cat-insurance', account_id: 'acc-bank-main', is_shared: false, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
    { id: 'ob-4', household_id: HOUSEHOLD, name: 'חופשה משפחתית', amount_agorot: 850_000, due_date: d(15, 2), status: 'upcoming', category_id: 'cat-travel', account_id: 'acc-bank-main', is_shared: true, notes: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, completed_transaction_id: null },
  ],
  recurring_transactions: [
    { id: 'rc-1', household_id: HOUSEHOLD, description: 'משכנתא לאומי', amount_agorot: -624_000, frequency: 'monthly', day_of_month: 10, next_due_date: d(10, 1), is_active: true, category_id: 'cat-home', account_id: 'acc-bank-main', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-2', household_id: HOUSEHOLD, description: 'גן ילדים עדן', amount_agorot: -215_000, frequency: 'monthly', day_of_month: 1, next_due_date: d(1, 1), is_active: true, category_id: 'cat-kids', account_id: 'acc-bank-main', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-3', household_id: HOUSEHOLD, description: 'חדר כושר', amount_agorot: -19_900, frequency: 'monthly', day_of_month: 15, next_due_date: d(15, 1), is_active: true, category_id: 'cat-sport', account_id: 'acc-card-visa', is_shared: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-4', household_id: HOUSEHOLD, description: 'ביטוח רכב', amount_agorot: -38_000, frequency: 'monthly', day_of_month: 20, next_due_date: d(20), is_active: true, category_id: 'cat-insurance', account_id: 'acc-bank-main', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-5', household_id: HOUSEHOLD, description: 'נטפליקס', amount_agorot: -5_490, frequency: 'monthly', day_of_month: 3, next_due_date: d(3, 1), is_active: true, category_id: 'cat-subs', account_id: 'acc-card-master', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-6', household_id: HOUSEHOLD, description: 'ספוטיפיי משפחתי', amount_agorot: -3_990, frequency: 'monthly', day_of_month: 7, next_due_date: d(7, 1), is_active: true, category_id: 'cat-subs', account_id: 'acc-card-master', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
    { id: 'rc-7', household_id: HOUSEHOLD, description: 'שכר לימוד חוג ילדים', amount_agorot: -32_000, frequency: 'monthly', day_of_month: 5, next_due_date: d(5, 1), is_active: true, category_id: 'cat-edu', account_id: 'acc-bank-main', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, last_generated_date: null },
  ],
  savings_goals: [
    { id: 'sg-1', household_id: HOUSEHOLD, name: 'חופשה ביוון', target_agorot: 1_200_000, current_agorot: 740_000, target_date: d(1, 6), is_completed: false, account_id: null, progress_source: 'manual', icon: 'airplane', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
    { id: 'sg-2', household_id: HOUSEHOLD, name: 'קרן חירום', target_agorot: 3_000_000, current_agorot: 1_150_000, target_date: null, is_completed: false, account_id: null, progress_source: 'manual', icon: 'shield', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
    { id: 'sg-3', household_id: HOUSEHOLD, name: 'רכב חדש', target_agorot: 8_000_000, current_agorot: 2_100_000, target_date: d(1, 18), is_completed: false, account_id: null, progress_source: 'manual', icon: 'car', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
    { id: 'sg-4', household_id: HOUSEHOLD, name: 'קרן השתלמות', target_agorot: 5_000_000, current_agorot: 4_320_000, target_date: null, is_completed: false, account_id: 'acc-savings-keren', progress_source: 'linked_account', icon: 'briefcase', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
    { id: 'sg-5', household_id: HOUSEHOLD, name: 'שיפוץ מטבח', target_agorot: 2_500_000, current_agorot: 2_500_000, target_date: null, is_completed: true, account_id: null, progress_source: 'manual', icon: 'home', color: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER },
  ],
  installment_plans: [
    { id: 'ip-sofa', household_id: HOUSEHOLD, description: 'ספה, מחסני רהיטים', total_agorot: 718_800, installment_count: 12, monthly_agorot: 59_900, first_charge_date: d(10, -4), category_id: null, account_id: 'acc-card-visa', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, merchant: 'מחסני רהיטים', purchase_date: d(18, -4) },
    { id: 'ip-fridge', household_id: HOUSEHOLD, description: 'מקרר, א.ל.מ חשמל', total_agorot: 480_000, installment_count: 12, monthly_agorot: 40_000, first_charge_date: d(10, -8), category_id: null, account_id: 'acc-card-visa', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, merchant: 'א.ל.מ חשמל', purchase_date: d(12, -8) },
    { id: 'ip-laptop', household_id: HOUSEHOLD, description: 'מחשב נייד, KSP', total_agorot: 480_000, installment_count: 10, monthly_agorot: 48_000, first_charge_date: d(5, -2), category_id: 'cat-tech', account_id: 'acc-card-master', is_shared: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, merchant: 'KSP', purchase_date: d(3, -2) },
    { id: 'ip-tv', household_id: HOUSEHOLD, description: 'טלוויזיה, איירפורט סיטי', total_agorot: 360_000, installment_count: 6, monthly_agorot: 60_000, first_charge_date: d(20, -1), category_id: 'cat-tech', account_id: 'acc-card-master', is_shared: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', version: 1, created_by: USER, merchant: 'איירפורט סיטי', purchase_date: d(18, -1) },
  ],
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
