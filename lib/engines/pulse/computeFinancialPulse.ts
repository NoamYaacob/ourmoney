// CP8E — Financial Pulse: "מה השתנה מאז הפעם האחרונה?" Pure, deterministic
// derivation of what to show from (a) the previous persisted snapshot, (b)
// the household's CURRENT Safe-to-Spend figure, and (c) already-computed
// data the caller passes in — never a second, divergent calculation of
// either. No network, no clock access (every date comparison is over
// already-known strings), no randomness — same inputs, same output, per
// CLAUDE.md's engine discipline.
//
// AUDITED SCOPE (this checkpoint's own brief, section 5): only ONE
// secondary-change source is supported — recurring price increases — and
// deliberately so. It is the only existing detector whose own "since last
// time" boundary needs NO new persisted state beyond captured_at, which
// this table already stores for the primary comparison:
// detectPriceIncreases() already finds "the newest observation vs. a
// baseline of its own prior history," so a detection's own `detectedAt`
// (the triggering transaction's txn_date) is already a real, existing
// signal of recency — filtering it against the previous snapshot's
// captured_at costs nothing extra. Every other candidate this checkpoint's
// brief lists (new/cleared alert, obligation becoming near-due, budget
// status shift) would need either a second persisted snapshot of that
// domain's own prior state, or an ambiguous historical reconstruction —
// exactly what section 5 says not to build. "Start narrow."
//
// RELEVANCE FILTER, NOT PROOF OF CAUSE (CP8E correction, post-independent-
// review): a negative delta may surface ONE specific transaction — defined
// here as "exactly one non-transfer, non-excluded expense was posted since
// the previous snapshot, AND its magnitude is within a reasonable band of
// the delta" — but this band check is a plausibility/relevance filter, NOT
// a causal proof. Safe-to-Spend can move for reasons this engine has no
// visibility into at all (a forecast-horizon date rolling an obligation
// into/out of its window, an edited recurring template's amount, a new
// obligation, an account balance change from any other source) with zero
// transactions involved — and even a materialized instalment transaction
// that DOES pass this filter nets against a *forecast* instalment
// reservation the same charge simultaneously reduces, so its own face
// amount is not necessarily its true net effect. The copy this engine's
// caller renders for the "one transaction" case must therefore never
// assert that the named transaction caused the delta — only that it is a
// real transaction, dated since last time, whose size is in the right
// range. Zero or multiple new transactions, or a lone transaction whose
// amount doesn't plausibly fit, fall back to the safer generic copy. Still
// a deliberately conservative bar: "financial truth outranks richer copy."

export interface FinancialPulsePreviousSnapshot {
  safeToSpendAgorot: number
  // ISO timestamp — the boundary every read-time-derived item (the causal
  // transaction, secondary price-increase detections) is filtered against:
  // "since last time" means "dated on/after this timestamp's own local
  // calendar date."
  capturedAt: string
}

// The minimal, already-available transaction shape this engine needs —
// same "adapt the real Transaction type into a narrow local interface"
// discipline features/recurring/lib/priceIncreaseDetection.ts's own
// RecurringChargeObservation already uses, keeping this file free of any
// Supabase/query-layer dependency.
export interface PulseTransactionObservation {
  id: string
  description: string
  amountAgorot: number // signed, exactly as stored — negative for an expense
  txnDate: string // YYYY-MM-DD
  isTransfer: boolean
  isExcluded: boolean
}

export interface PulsePriceIncreaseObservation {
  description: string
  increaseAgorot: number
  detectedAt: string // YYYY-MM-DD — the triggering transaction's txn_date
}

export type FinancialPulseCause =
  | { kind: 'transaction'; description: string; amountAgorot: number }
  | { kind: 'generic' }

export interface FinancialPulseSecondaryItem {
  kind: 'recurring_price_increase'
  description: string
  increaseAgorot: number
}

export interface FinancialPulseResult {
  safeToSpendDeltaAgorot: number
  previousSafeToSpendAgorot: number
  currentSafeToSpendAgorot: number
  // CP8E correction: whether safeToSpendDeltaAgorot clears
  // MATERIALITY_THRESHOLD_AGOROT. The caller (FinancialPulseCard) must
  // gate the primary headline on THIS field, never on
  // `safeToSpendDeltaAgorot === 0` — a sub-threshold delta is real and
  // non-zero, but still not material enough to headline.
  hasPrimaryChange: boolean
  cause: FinancialPulseCause | null
  secondaryItems: FinancialPulseSecondaryItem[]
}

// A lone new transaction is named as "the reason" only when its magnitude
// falls in this band relative to the delta it's explaining — tight enough
// that naming it never contradicts the number right above it, loose enough
// to allow for a little unrelated same-day noise (a rounding-scale refund,
// a second tiny purchase) without losing the causal claim entirely. Pure,
// named constant — tune here, nowhere else.
const CAUSE_BAND_MIN_RATIO = 0.7
const CAUSE_BAND_MAX_RATIO = 1.3

// At most this many secondary items are ever shown — "up to a FEW
// secondary changes," per this checkpoint's own product contract, never a
// growing list.
const MAX_SECONDARY_ITEMS = 2

// CP8E correction: a Safe-to-Spend move smaller than this is real but too
// small to headline as a Financial Pulse. Fixed product constant — ₪5.00,
// integer agorot, not configurable, not a percentage. ">=" so a delta of
// exactly 500 agorot (₪5.00) still counts.
const MATERIALITY_THRESHOLD_AGOROT = 500

function localDateOf(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function resolveCause(
  deltaAgorot: number,
  transactionsSincePrevious: readonly PulseTransactionObservation[]
): FinancialPulseCause | null {
  if (deltaAgorot >= 0) return null // no "reason" framing for a flat/positive change — see this file's header

  const newExpenses = transactionsSincePrevious.filter((t) => !t.isTransfer && !t.isExcluded && t.amountAgorot < 0)
  if (newExpenses.length !== 1) return { kind: 'generic' }

  const only = newExpenses[0]!
  const deltaMagnitude = Math.abs(deltaAgorot)
  const txnMagnitude = Math.abs(only.amountAgorot)
  const inBand = txnMagnitude >= deltaMagnitude * CAUSE_BAND_MIN_RATIO && txnMagnitude <= deltaMagnitude * CAUSE_BAND_MAX_RATIO
  if (!inBand) return { kind: 'generic' }

  return { kind: 'transaction', description: only.description, amountAgorot: only.amountAgorot }
}

export function computeFinancialPulse(input: {
  previousSnapshot: FinancialPulsePreviousSnapshot | null
  currentSafeToSpendAgorot: number
  // Non-transfer/non-excluded filtering is the CALLER's job for
  // secondary-item candidates elsewhere in the app (matches
  // usePriceIncreaseDetections' own existing filtering) — but for the
  // causal-transaction candidates specifically, pass every transaction
  // dated on/after a safe lower bound (this function does its own
  // date-boundary + transfer/exclusion filtering here, since the exact
  // boundary depends on previousSnapshot, which only this function knows).
  transactionsSincePreviousCandidate: readonly PulseTransactionObservation[]
  priceIncreases: readonly PulsePriceIncreaseObservation[]
}): FinancialPulseResult | null {
  const { previousSnapshot, currentSafeToSpendAgorot, transactionsSincePreviousCandidate, priceIncreases } = input

  // First visit — no previous snapshot exists, so there is nothing to
  // compare against. Never a fabricated "no change" baseline.
  if (previousSnapshot === null) return null

  const previousLocalDate = localDateOf(previousSnapshot.capturedAt)

  const transactionsSincePrevious = transactionsSincePreviousCandidate.filter((t) => t.txnDate >= previousLocalDate)

  const secondaryItems: FinancialPulseSecondaryItem[] = priceIncreases
    .filter((p) => p.detectedAt >= previousLocalDate)
    .slice(0, MAX_SECONDARY_ITEMS)
    .map((p) => ({ kind: 'recurring_price_increase' as const, description: p.description, increaseAgorot: p.increaseAgorot }))

  const deltaAgorot = currentSafeToSpendAgorot - previousSnapshot.safeToSpendAgorot
  const hasPrimaryChange = Math.abs(deltaAgorot) >= MATERIALITY_THRESHOLD_AGOROT

  // Nothing truthfully changed since last time, on either axis — the
  // calmer of section 10's two allowed options: omit entirely, never a
  // hollow "לא השתנה כלום." A sub-threshold delta is real but not material
  // enough to headline, and is treated the same as "no change" here.
  if (!hasPrimaryChange && secondaryItems.length === 0) return null

  return {
    safeToSpendDeltaAgorot: deltaAgorot,
    previousSafeToSpendAgorot: previousSnapshot.safeToSpendAgorot,
    currentSafeToSpendAgorot,
    hasPrimaryChange,
    cause: hasPrimaryChange ? resolveCause(deltaAgorot, transactionsSincePrevious) : null,
    secondaryItems,
  }
}
