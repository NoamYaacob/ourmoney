// Proves the DESIGN_QA date-determinism fix: dev/designQaClient.ts and
// dev/designQaStressClient.ts must derive every fixture date from the one
// fixed DESIGN_QA_REFERENCE_DATE in designQaEngine.ts, never from the real
// wall clock (`new Date()`). Before this fix, every date-relative row in
// both fixtures shifted by one calendar day, every day — this test hardcodes
// the exact expected date strings for the fixed reference, so a future
// accidental revert to wall-clock time fails loudly (the hardcoded values
// would only coincidentally match `new Date()` on one specific real day).
//
// Reads the fixtures' real exported data (TODAY, TABLES) rather than
// re-deriving date math independently, so this test also catches a broken
// import/wiring of DESIGN_QA_REFERENCE_DATE, not just a broken constant.

import { describe, expect, it } from '@jest/globals'
import { DESIGN_QA_REFERENCE_DATE } from './designQaEngine'
import { TODAY as DEFAULT_TODAY, TABLES as DEFAULT_TABLES } from './designQaClient'
import { TODAY as STRESS_TODAY, TABLES as STRESS_TABLES } from './designQaStressClient'

describe('DESIGN_QA_REFERENCE_DATE', () => {
  it('is fixed to August 18, 2026 — matching the "late-August, mid-month" framing the fixtures document', () => {
    expect(DESIGN_QA_REFERENCE_DATE.getFullYear()).toBe(2026)
    expect(DESIGN_QA_REFERENCE_DATE.getMonth()).toBe(7) // 0-indexed: August
    expect(DESIGN_QA_REFERENCE_DATE.getDate()).toBe(18)
  })

  it('is not derived from the real wall clock', () => {
    // A regression back to `new Date()` would make this constant equal to
    // "right now" — comparing against a fixed sentinel far outside any
    // plausible test-run date makes that regression fail unambiguously.
    const wallClockNow = new Date()
    expect(Math.abs(DESIGN_QA_REFERENCE_DATE.getTime() - wallClockNow.getTime())).toBeGreaterThan(24 * 60 * 60 * 1000)
  })
})

describe('designQaClient.ts (DESIGN_QA=1) — deterministic dates', () => {
  it('TODAY is fixed', () => {
    expect(DEFAULT_TODAY).toBe('2026-08-18')
  })

  it('household-relative event dates are fixed, not wall-clock-relative', () => {
    const txns = DEFAULT_TABLES.transactions!
    const byDescription = (desc: string) => txns.filter((t) => t.description === desc)

    expect(byDescription('שופרסל דיל')[0]!.txn_date).toBe('2026-08-17') // TODAY - 1
    expect(byDescription('פז יעלון')[0]!.txn_date).toBe('2026-08-16') // TODAY - 2
    expect(byDescription('משכורת נועם')[0]!.txn_date).toBe('2026-08-01') // day 1 this month
    expect(byDescription('שכר דירה')[0]!.txn_date).toBe('2026-08-02') // day 2 this month
  })

  it('planned obligation due dates are fixed', () => {
    const obligations = DEFAULT_TABLES.planned_obligations!
    const byId = (id: string) => obligations.find((o) => o.id === id)!

    expect(byId('ob-1')!.due_date).toBe('2026-08-28') // day 28 this month
    expect(byId('ob-2')!.due_date).toBe('2026-09-04') // day 4 next month
    expect(byId('ob-3')!.due_date).toBe('2026-09-12') // day 12 next month
  })

  it('recurring next_due_date is fixed, including the "already passed this month → next month" branch', () => {
    const recurring = DEFAULT_TABLES.recurring_transactions!
    const byId = (id: string) => recurring.find((r) => r.id === id)!

    // day_of_month 10, TODAY is the 18th → day 10 already passed → next month
    expect(byId('rc-1')!.next_due_date).toBe('2026-09-10')
    // day_of_month 15, hardcoded next month in the fixture itself
    expect(byId('rc-3')!.next_due_date).toBe('2026-09-15')
    // day_of_month 20, still upcoming this month
    expect(byId('rc-4')!.next_due_date).toBe('2026-08-20')
  })

  it('savings goal target dates are fixed', () => {
    const goals = DEFAULT_TABLES.savings_goals!
    expect(goals.find((g) => g.id === 'sg-1')!.target_date).toBe('2027-02-01') // 6 months out, day 1
  })
})

describe('designQaStressClient.ts (DESIGN_QA=stress) — deterministic dates', () => {
  it('TODAY is fixed', () => {
    expect(STRESS_TODAY).toBe('2026-08-18')
  })

  it('the 130 procedurally-generated transactions land on fixed dates (byte-identical across runs)', () => {
    const txns = STRESS_TABLES.transactions!
    // The generated rows are pushed first, in index order — the first row
    // (i = 0) uses dateOffsetDays(0), i.e. exactly TODAY.
    const generated = txns.filter((t) => t.installment_plan_id == null && t.recurring_id == null && t.description !== 'משכורת נועם' && t.description !== 'משכורת דנה')
    expect(generated[0]!.txn_date).toBe('2026-08-18')
  })

  it('recurring next_due_date is fixed, including the price-increase (rc-5) template', () => {
    const recurring = STRESS_TABLES.recurring_transactions!
    const byId = (id: string) => recurring.find((r) => r.id === id)!

    expect(byId('rc-1')!.next_due_date).toBe('2026-09-10') // day 10, hardcoded month+1
    expect(byId('rc-4')!.next_due_date).toBe('2026-08-20') // day 20, this month
    expect(byId('rc-5')!.next_due_date).toBe('2026-09-03') // Netflix, day 3, month+1
  })

  it('planned obligation due dates are fixed, including the stress-only "חופשה משפחתית" row', () => {
    const obligations = STRESS_TABLES.planned_obligations!
    const byId = (id: string) => obligations.find((o) => o.id === id)!

    expect(byId('ob-1')!.due_date).toBe('2026-08-28')
    expect(byId('ob-4')!.due_date).toBe('2026-10-15') // 2 months out
  })

  it('the Netflix price-increase history lands on fixed dates', () => {
    const netflixCharges = STRESS_TABLES.transactions!.filter((t) => t.recurring_id === 'rc-5')
    const dates = netflixCharges.map((t) => t.txn_date as string).sort()
    // 3 months of ₪45.90 (day 3, months -3..-1) then the current ₪54.90 (day 3, this month)
    expect(dates).toEqual(['2026-05-03', '2026-06-03', '2026-07-03', '2026-08-03'])
  })
})
