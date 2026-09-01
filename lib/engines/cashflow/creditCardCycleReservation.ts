// RRR P1 finding #7 — a credit card's posted CURRENT-CYCLE spend (ordinary
// purchases, and any instalment charge that has already materialized into a
// real transaction this cycle) is a real, already-committed future claim on
// cash — the household will pay it off via an ordinary transfer once the
// statement settles (ADR-037's settlement-as-transfer decision), the exact
// same economic shape as an instalment's forecasted future charge, which
// calculateSafeToSpend.ts already reserves. Before this fix, nothing
// reserved it: the card's own balance is never counted as available cash
// (eligibleCashAccounts.ts), and this cycle's already-posted spend was never
// fed into calculateSafeToSpend/calculateCashFlowForecast/calculateImpactCheck
// at all — so a household's Safe-to-Spend figure ignored a real debt purely
// because of which account type happened to record it.
//
// Reuses, does not reimplement: getCurrentBillingCycleRange and
// computeCurrentCycleSpendAgorot (features/accounts/lib/creditCardCycle.ts)
// — the exact same pure functions that already compute "current cycle
// spend" for the Credit & Payments screen and the high-cycle-spend alert.
// This file is the ONE place that result is turned into a reservation item
// the forecast engines can consume — no second, divergent calculation of
// what a card's current cycle spend is.
//
// No installment-linkage filtering here, deliberately: once a purchase is
// posted to the card (ordinary or a materialized instalment charge), it
// counts toward the next statement either way. forecastInstallmentOccurrences
// only ever forecasts strictly AFTER a plan's last materialized index (see
// its own header + CLAUDE.md's "Double-counting prevention" section), so a
// charge counted here (already posted) can never also be produced as a
// forecast occurrence there — no double reservation.
//
// Only the CURRENT, still-open cycle is ever reserved — a previous, already-
// closed cycle's spend was already settled via a transfer the household has
// already made; reserving it again would double-count money already paid.

import { computeCurrentCycleSpendAgorot, getCurrentBillingCycleRange, type CycleSpendTransaction } from '@/features/accounts/lib/creditCardCycle'

// A billing cycle is at most ~31 days (a calendar month) — any household's
// CURRENT, still-open cycle can therefore never start more than this many
// days before today, regardless of billing_cycle_day. Callers (the three
// cashflow hooks) fetch transactions bounded to this lookback instead of the
// household's full history — see each hook's own fetch for the exact query.
export const CREDIT_CARD_CYCLE_LOOKBACK_DAYS = 35

export interface CreditCardCycleAccountInput {
  id: string
  name: string
  type: string
  is_active: boolean
  include_in_total: boolean
  billing_cycle_day: number | null
}

export interface CreditCardCycleTransactionInput extends CycleSpendTransaction {
  account_id: string | null
}

export interface CreditCardCycleReservationItem {
  accountId: string
  // The card's own name — same "just the entity's own name, no engine-
  // injected extra text" contract as SafeToSpendItem.description for every
  // other source (an obligation's name, a recurring template's description).
  description: string
  // Always positive — a magnitude, matching every other SafeToSpendItem's
  // own contract (calculateSafeToSpend.ts).
  amountAgorot: number
  // The current cycle's own closing date — the nearest concrete, honest
  // proxy for "when this needs to be paid" available without inventing a
  // statement-due-date concept this app's schema does not have (migration
  // 016/ADR-037 deliberately never persists a card_statements table).
  date: string
}

export function computeCreditCardCycleReservations(
  accounts: readonly CreditCardCycleAccountInput[],
  transactions: readonly CreditCardCycleTransactionInput[],
  today: string
): CreditCardCycleReservationItem[] {
  const items: CreditCardCycleReservationItem[] = []

  for (const account of accounts) {
    if (account.type !== 'credit_card') continue
    if (!account.is_active || !account.include_in_total) continue
    if (account.billing_cycle_day === null) continue

    const range = getCurrentBillingCycleRange(account.billing_cycle_day, today)
    const accountTransactions = transactions.filter((t) => t.account_id === account.id)
    const amountAgorot = computeCurrentCycleSpendAgorot(accountTransactions, range)

    if (amountAgorot > 0) {
      items.push({ accountId: account.id, description: account.name, amountAgorot, date: range.end })
    }
  }

  return items
}
