// CP8F — Single Purchase Impact Check: "אפשר להרשות לעצמנו את זה?"
//
// HARD SCOPE (this checkpoint's own brief): this is NOT Financial Twin, NOT
// scenario planning, NOT a general what-if simulator. Exactly one supported
// question: "assume one additional immediate household expense of X agorot
// happens now — what does that do to the existing Safe-to-Spend / forecast?"
// One amount, one immediate hypothetical outflow, one deterministic
// recalculation. No saved scenarios, no edited income/recurring/obligations,
// no future-dated hypothetical, no comparison, no AI, no persistence.
//
// PRODUCTION CONTRACT — stated explicitly, not hand-waved (this checkpoint's
// own brief, section 1): Impact Check models the hypothetical amount as an
// IMMEDIATE CASH-EQUIVALENT HOUSEHOLD OUTFLOW happening now. Concretely:
// both calculateSafeToSpend's `availableCashAgorot` and
// calculateCashFlowForecast's `startingBalanceAgorot` are reduced by the
// hypothetical amount before rerunning each engine — the exact number
// `eligibleCashAccounts.ts` already sums from checking/cash accounts only
// (never a credit card's own balance — that file's own header explains why:
// a credit line/debt is never positive cash). This does NOT model every
// payment method with equal precision:
//
//   - A CASH/CHECKING purchase is modeled correctly and immediately — this
//     is exactly what eligibleCashAccounts.ts already treats as spendable
//     cash, so subtracting from it is a faithful simulation.
//   - A CREDIT-CARD purchase does NOT immediately reduce available cash in
//     this app's own model (CP8E's own empirical finding, restated here
//     because it is exactly why this contract must be explicit): a posted
//     card purchase only becomes a real claim on cash later, when the
//     statement settles (ADR-037's settlement-as-transfer decision).
//     Impact Check does not attempt to model that settlement timing — it
//     deliberately does not ask the user which payment method they'd use
//     (out of scope, per this checkpoint's own brief section 10). The
//     single cash-equivalent-outflow contract is the one financially
//     coherent simplification available without expanding scope into
//     payment-method-specific modeling.
//
// NO NEW FINANCIAL LOGIC: every actual number this file produces comes from
// re-running the SAME, unmodified calculateSafeToSpend and
// calculateCashFlowForecast engines this app already ships (Safe-to-Spend's
// own hero figure, the Cash Flow forecast's own low point) — twice each,
// once against the real assembled inputs unchanged (the "current" figures),
// once against the identical inputs with only the cash figure reduced by
// the hypothetical amount (the "post-purchase" figures). This file adds no
// obligation/recurring/installment row, no persisted state, no Supabase
// call — see this checkpoint's own brief section 2/3.
//
// VERDICT CONTRACT (section 4): the smallest truthful rule that needs no
// invented threshold — UNSAFE iff the post-purchase forecast's own low
// point drops below zero, SAFE otherwise. No CAUTION tier: this checkpoint's
// brief only sanctions one if its threshold is "financially explicit," and
// no such threshold exists in this app's data today — inventing one would
// be exactly the kind of fabricated financial advice CLAUDE.md's
// Deterministic Financial Logic rule forbids ("never generate, estimate, or
// 'reason about' a monetary value" — a CAUTION cutoff would be reasoning
// about risk this engine has no real basis for). Simpler and truthful.

import { calculateSafeToSpend } from './calculateSafeToSpend'
import { calculateCashFlowForecast } from './calculateCashFlowForecast'
import type { ForecastEngineInputs } from './assembleForecastInputs'

export type ImpactCheckVerdict = 'SAFE' | 'UNSAFE'

export interface ImpactCheckInput extends ForecastEngineInputs {
  // The Safe-to-Spend horizon end (matches whatever horizon the caller's
  // own useSafeToSpend call already uses) and the cash-flow forecast's own
  // start/end — passed straight through, unchanged, to the two engines.
  safeToSpendHorizonEnd: string
  forecastStartDate: string
  forecastEndDate: string
  // Precondition: a positive integer number of agorot. Validating user
  // input (empty/zero/negative/too-large) is the caller's job — see
  // lib/money/format.ts's agorotFromILS, the app's one canonical amount
  // parser — never this engine's. This engine still behaves sanely (not by
  // throwing) for a non-positive amount so its own tests can prove that
  // directly, but production callers must never let one reach here.
  hypotheticalExpenseAgorot: number
}

export interface ImpactCheckResult {
  hypotheticalExpenseAgorot: number
  currentSafeToSpendAgorot: number
  postPurchaseSafeToSpendAgorot: number
  currentLowPointAgorot: number
  currentLowPointDate: string
  postPurchaseLowPointAgorot: number
  postPurchaseLowPointDate: string
  // True iff the POST-purchase forecast's own low point is negative — this
  // is the raw fact `verdict` is derived from, exposed separately because
  // the UI needs to state the consequence in its own words without
  // re-deriving it from the verdict enum.
  crossesBelowZero: boolean
  verdict: ImpactCheckVerdict
}

export function calculateImpactCheck(input: ImpactCheckInput): ImpactCheckResult {
  const sharedEngineInputs = {
    obligations: input.obligations,
    recurringTemplates: input.recurringTemplates,
    installmentPlans: input.installmentPlans,
  }

  const currentSafeToSpend = calculateSafeToSpend({
    ...sharedEngineInputs,
    availableCashAgorot: input.availableCashAgorot,
    horizonEnd: input.safeToSpendHorizonEnd,
  })
  const postPurchaseSafeToSpend = calculateSafeToSpend({
    ...sharedEngineInputs,
    availableCashAgorot: input.availableCashAgorot - input.hypotheticalExpenseAgorot,
    horizonEnd: input.safeToSpendHorizonEnd,
  })

  const currentForecast = calculateCashFlowForecast({
    ...sharedEngineInputs,
    startingBalanceAgorot: input.availableCashAgorot,
    startDate: input.forecastStartDate,
    endDate: input.forecastEndDate,
  })
  const postPurchaseForecast = calculateCashFlowForecast({
    ...sharedEngineInputs,
    startingBalanceAgorot: input.availableCashAgorot - input.hypotheticalExpenseAgorot,
    startDate: input.forecastStartDate,
    endDate: input.forecastEndDate,
  })

  const crossesBelowZero = postPurchaseForecast.lowestBalanceAgorot < 0

  return {
    hypotheticalExpenseAgorot: input.hypotheticalExpenseAgorot,
    currentSafeToSpendAgorot: currentSafeToSpend.safeToSpendAgorot,
    postPurchaseSafeToSpendAgorot: postPurchaseSafeToSpend.safeToSpendAgorot,
    currentLowPointAgorot: currentForecast.lowestBalanceAgorot,
    currentLowPointDate: currentForecast.lowestBalanceDate,
    postPurchaseLowPointAgorot: postPurchaseForecast.lowestBalanceAgorot,
    postPurchaseLowPointDate: postPurchaseForecast.lowestBalanceDate,
    crossesBelowZero,
    verdict: crossesBelowZero ? 'UNSAFE' : 'SAFE',
  }
}
