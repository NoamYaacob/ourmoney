// Deterministic "unusually high upcoming credit-card debit" detection — no
// extrapolation of the in-progress cycle (the same "prefer a direct,
// non-projected comparison" discipline this alert deliberately applies,
// distinct from lib/engines/budgets/calculateBudgetPace.ts's projection,
// which was explicitly requested and clearly labeled as a projection). This
// fires only on a plain fact: the current, still-open billing cycle has
// ALREADY accumulated more spend than the previous, fully-closed cycle's
// complete total — true regardless of how many days remain in the current
// cycle, so it never needs to guess where the cycle will end up.
//
// Reuses features/accounts/lib/creditCardCycle.ts's existing
// getCurrentBillingCycleRange/getPreviousBillingCycleRange/
// computeCurrentCycleSpendAgorot verbatim — no second cycle-math
// implementation.

import {
  computeCurrentCycleSpendAgorot,
  getCurrentBillingCycleRange,
  getPreviousBillingCycleRange,
  type CycleSpendTransaction,
} from '@/features/accounts/lib/creditCardCycle'

export interface CreditCardCycleSpendThreshold {
  minAbsoluteAgorot: number
  minPercent: number
}

// Conservative default, mirroring features/recurring/lib/
// priceIncreaseDetection.ts's own DEFAULT_PRICE_INCREASE_THRESHOLD reasoning
// (both conditions required, not either — avoids a tiny-percent-on-a-huge-
// card or tiny-absolute-on-a-small-card false positive). No existing repo
// convention for "what counts as unusually high card spend" — a pure,
// exported constant so it can be tuned later without touching the detector.
export const DEFAULT_CREDIT_CARD_CYCLE_SPEND_THRESHOLD: CreditCardCycleSpendThreshold = {
  minAbsoluteAgorot: 30_000, // ₪300.00
  minPercent: 20,
}

export interface CreditCardCycleAccountInput {
  accountId: string
  accountName: string
  billingCycleDay: number
  // This account's own transactions only — never filtered by is_shared/
  // is_excluded (a personal card purchase is exactly as real a claim on the
  // upcoming statement as a shared one), matching
  // computeCurrentCycleSpendAgorot's own filtering (transfer legs and
  // income-signed rows excluded internally).
  transactions: readonly CycleSpendTransaction[]
}

export interface HighCreditCardCycleSpendDetection {
  accountId: string
  accountName: string
  currentCycleSpendAgorot: number
  previousCycleSpendAgorot: number
  excessAgorot: number
  excessPercent: number
  currentCycleEnd: string
}

export function detectHighCreditCardCycleSpend(
  input: CreditCardCycleAccountInput,
  today: string,
  threshold: CreditCardCycleSpendThreshold = DEFAULT_CREDIT_CARD_CYCLE_SPEND_THRESHOLD
): HighCreditCardCycleSpendDetection | null {
  const currentRange = getCurrentBillingCycleRange(input.billingCycleDay, today)
  const previousRange = getPreviousBillingCycleRange(input.billingCycleDay, today)

  const currentCycleSpendAgorot = computeCurrentCycleSpendAgorot(input.transactions, currentRange)
  const previousCycleSpendAgorot = computeCurrentCycleSpendAgorot(input.transactions, previousRange)

  // No previous-cycle spend at all — nothing to compare against (a brand
  // new card, or a cycle with zero charges). Never invent a baseline.
  if (previousCycleSpendAgorot <= 0) return null

  const excessAgorot = currentCycleSpendAgorot - previousCycleSpendAgorot
  if (excessAgorot <= 0) return null

  const meetsAbsolute = excessAgorot >= threshold.minAbsoluteAgorot
  // Integer cross-multiplication, matching priceIncreaseDetection.ts's
  // meetsPercent — never a float ratio for the pass/fail decision itself.
  const meetsPercent = excessAgorot * 100 >= previousCycleSpendAgorot * threshold.minPercent
  if (!meetsAbsolute || !meetsPercent) return null

  const excessPercent = Math.round((excessAgorot / previousCycleSpendAgorot) * 1000) / 10

  return {
    accountId: input.accountId,
    accountName: input.accountName,
    currentCycleSpendAgorot,
    previousCycleSpendAgorot,
    excessAgorot,
    excessPercent,
    currentCycleEnd: currentRange.end,
  }
}
