// RRR P1 finding #7 — a credit card's posted CURRENT-CYCLE spend must be
// reserved by Safe-to-Spend exactly like any other already-committed future
// claim on cash (an instalment's forecasted future charge already is —
// calculateSafeToSpend.ts's own header comment states the principle: "Not
// reserving it would let Safe-to-Spend ignore a real, already-committed
// future claim on cash purely because of which account type happened to
// record it"). This file's own tests trace the specific reproduction cases
// the remediation brief calls out by name.
import { describe, expect, it } from '@jest/globals'
import { computeCreditCardCycleReservations, type CreditCardCycleAccountInput, type CreditCardCycleTransactionInput } from './creditCardCycleReservation'

const TODAY = '2026-08-18'

function card(overrides: Partial<CreditCardCycleAccountInput> = {}): CreditCardCycleAccountInput {
  return { id: 'acc-card', name: 'ויזה כאל', type: 'credit_card', is_active: true, include_in_total: true, billing_cycle_day: 10, ...overrides }
}

function txn(overrides: Partial<CreditCardCycleTransactionInput> = {}): CreditCardCycleTransactionInput {
  return {
    account_id: 'acc-card',
    amount_agorot: -10_000,
    txn_date: TODAY,
    transfer_id: null,
    is_excluded: false,
    ...overrides,
  }
}

describe('computeCreditCardCycleReservations', () => {
  it('reserves an ordinary posted purchase this cycle', () => {
    const items = computeCreditCardCycleReservations([card()], [txn({ amount_agorot: -41_280, txn_date: '2026-08-16' })], TODAY)
    expect(items).toEqual([{ accountId: 'acc-card', description: 'ויזה כאל', amountAgorot: 41_280, date: '2026-09-10' }])
  })

  it('reserves a materialized instalment charge posted this cycle exactly like an ordinary purchase', () => {
    // A materialized instalment transaction is an ordinary posted row on the
    // card (category_id null, installment_plan_id set) — this function does
    // no category/installment-linkage filtering at all, on purpose: once
    // charged to the card, it is real money owed on the next statement
    // either way, and forecastInstallmentOccurrences.ts only ever forecasts
    // strictly AFTER the last materialized index, so there is no double
    // count between "this posted charge" (here) and "the next not-yet-
    // materialized instalment charge" (forecastInstallmentOccurrences).
    const items = computeCreditCardCycleReservations([card()], [txn({ amount_agorot: -59_900, txn_date: '2026-08-15' })], TODAY)
    expect(items).toEqual([{ accountId: 'acc-card', description: 'ויזה כאל', amountAgorot: 59_900, date: '2026-09-10' }])
  })

  it('sums multiple posted purchases within the same open cycle into one reservation', () => {
    const items = computeCreditCardCycleReservations(
      [card()],
      [
        txn({ amount_agorot: -41_280, txn_date: '2026-08-16' }),
        txn({ amount_agorot: -32_450, txn_date: '2026-08-17' }),
        txn({ amount_agorot: -18_900, txn_date: '2026-08-11' }),
      ],
      TODAY
    )
    expect(items).toEqual([{ accountId: 'acc-card', description: 'ויזה כאל', amountAgorot: 92_630, date: '2026-09-10' }])
  })

  it('never reserves spend from an already-settled previous cycle', () => {
    // 2026-08-09 falls in the PREVIOUS cycle (closed 2026-08-10) relative to
    // TODAY (2026-08-18, current cycle 2026-08-11..2026-09-10) — the
    // household already paid that statement via an ordinary transfer
    // (ADR-037), so reserving it again would double-count money already
    // settled.
    const items = computeCreditCardCycleReservations([card()], [txn({ amount_agorot: -50_000, txn_date: '2026-08-09' })], TODAY)
    expect(items).toEqual([])
  })

  it('produces no reservation for a card with zero posted spend this cycle', () => {
    const items = computeCreditCardCycleReservations([card()], [], TODAY)
    expect(items).toEqual([])
  })

  it('excludes transfer legs — a statement payment is never spend (ADR-037)', () => {
    const items = computeCreditCardCycleReservations(
      [card()],
      [txn({ amount_agorot: 60_000, txn_date: '2026-08-16', transfer_id: 'tr-1' })],
      TODAY
    )
    expect(items).toEqual([])
  })

  it('excludes an is_excluded transaction (e.g. a reimbursed purchase), matching every other spend total in the app', () => {
    const items = computeCreditCardCycleReservations([card()], [txn({ amount_agorot: -10_000, is_excluded: true })], TODAY)
    expect(items).toEqual([])
  })

  it('never counts a checking/cash account\'s own spending as a credit-card reservation', () => {
    const items = computeCreditCardCycleReservations(
      [card({ id: 'acc-bank', type: 'checking', billing_cycle_day: null })],
      [txn({ account_id: 'acc-bank', amount_agorot: -10_000 })],
      TODAY
    )
    expect(items).toEqual([])
  })

  it('skips a credit card with no billing_cycle_day set (nothing to compute a cycle from)', () => {
    const items = computeCreditCardCycleReservations([card({ billing_cycle_day: null })], [txn()], TODAY)
    expect(items).toEqual([])
  })

  it('skips an inactive or opted-out (include_in_total: false) card, matching eligibleCashAccounts.ts\'s own opt-out convention', () => {
    const inactive = computeCreditCardCycleReservations([card({ is_active: false })], [txn()], TODAY)
    expect(inactive).toEqual([])
    const optedOut = computeCreditCardCycleReservations([card({ include_in_total: false })], [txn()], TODAY)
    expect(optedOut).toEqual([])
  })

  it('reflects a transaction deletion/edit live — no persisted duplicate of its own', () => {
    const before = computeCreditCardCycleReservations([card()], [txn({ amount_agorot: -41_280 }), txn({ amount_agorot: -32_450, txn_date: '2026-08-17' })], TODAY)
    expect(before[0]?.amountAgorot).toBe(73_730)
    // Deleting one transaction (simulated by simply not passing it) and
    // editing the other's amount must both be reflected immediately, since
    // this function always recomputes from whatever transactions it's
    // given — there is no separate persisted total anywhere to go stale.
    const afterDeleteAndEdit = computeCreditCardCycleReservations([card()], [txn({ amount_agorot: -20_000 })], TODAY)
    expect(afterDeleteAndEdit[0]?.amountAgorot).toBe(20_000)
  })

  it('produces one reservation item per credit card when a household has more than one', () => {
    const items = computeCreditCardCycleReservations(
      [card({ id: 'acc-card-1', billing_cycle_day: 10 }), card({ id: 'acc-card-2', billing_cycle_day: 5 })],
      [
        txn({ account_id: 'acc-card-1', amount_agorot: -30_000, txn_date: '2026-08-16' }),
        txn({ account_id: 'acc-card-2', amount_agorot: -15_000, txn_date: '2026-08-16' }),
      ],
      TODAY
    )
    expect(items).toEqual(
      expect.arrayContaining([
        { accountId: 'acc-card-1', description: 'ויזה כאל', amountAgorot: 30_000, date: '2026-09-10' },
        { accountId: 'acc-card-2', description: 'ויזה כאל', amountAgorot: 15_000, date: '2026-09-05' },
      ])
    )
    expect(items).toHaveLength(2)
  })
})
