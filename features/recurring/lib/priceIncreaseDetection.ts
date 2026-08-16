// Deterministic price-increase detection over existing transaction history —
// no AI, no new schema, no persisted alert table (computed fresh from
// query data every time, same "no redundant derived state" discipline as
// features/budgets/hooks/useBudgetProgress.ts). See this file's own
// grouping/threshold/baseline comments for the reasoning behind each choice.
//
// CRITICAL FINDING (audited before writing this file): auto-generated
// recurring transactions (source='recurring', migration 003's
// generate_recurring_transactions()) copy recurring_transactions
// .amount_agorot VERBATIM into every generated row, every time — the
// generator never reads or infers a "real" charged amount. This means a
// series of auto-generated rows for one template can NEVER by itself
// reveal a real-world price change: every row is identical by
// construction until a household member manually edits the template's
// amount (useUpdateRecurringTransaction). Grouping by recurring_id below
// is still correct and useful — it detects exactly that "the template's
// amount was changed" step, which is exactly what happens when a member
// notices Netflix charged more and updates the template to match — but it
// depends on that habit. For households that log a recurring bill by hand
// or via CSV import instead of ever using a recurring_transactions
// template (very plausibly the common case for ארנונה/ביטוח-style Israeli
// bills), those transactions have recurring_id = NULL entirely, so a
// second, conservative identity signal (normalized merchant_name/
// description + account_id) is required — see groupKeyForObservation.

export interface PriceIncreaseThreshold {
  minAbsoluteAgorot: number
  minPercent: number
}

// Conservative default, chosen deliberately (no existing repo convention
// for "what counts as a meaningful bill increase" — searched
// docs/ROADMAP.md, FEATURES.md, DECISIONS.md, ARCHITECTURE.md first).
// BOTH conditions must be met, not either — "avoid false positives over
// aggressive detection" is stated twice in this milestone's brief, and an
// OR threshold lets either a tiny-percent-on-a-huge-bill (₪10 more on a
// ₪5,000 rent payment: 0.2%) or a tiny-absolute-on-a-cheap-bill (₪1 more
// on a ₪2 item: 50%) fire on noise. Requiring both catches the household-
// meaningful cases (the Netflix/internet examples in the milestone brief
// both clear both bars comfortably) while suppressing rounding/rate-card
// noise on either end of the amount spectrum. A pure, exported constant —
// tune here, nowhere else, if product data later suggests a different bar.
export const DEFAULT_PRICE_INCREASE_THRESHOLD: PriceIncreaseThreshold = {
  minAbsoluteAgorot: 500, // ₪5.00
  minPercent: 5,
}

// The minimal, already-available shape this engine needs from a
// transactions row — callers adapt features/transactions' Transaction type
// (or any other source) into this, keeping the engine free of any
// Supabase/query-layer dependency (no UI/network code inside the engine,
// per this milestone's own requirement).
export interface RecurringChargeObservation {
  id: string
  recurringId: string | null
  accountId: string | null
  description: string
  merchantName: string | null
  // Raw signed amount_agorot, exactly as stored (negative for an expense —
  // CLAUDE.md / DATABASE_SCHEMA.md convention). Never pre-negated by the
  // caller; this file owns the sign flip so "what counts as an expense" is
  // decided in exactly one place.
  amountAgorot: number
  txnDate: string // YYYY-MM-DD
  isExcluded: boolean
}

export interface PriceIncreaseDetection {
  identityKey: string
  recurringId: string | null
  description: string
  previousAmountAgorot: number
  currentAmountAgorot: number
  increaseAgorot: number
  // Display-only — CLAUDE.md/this milestone's brief both allow float
  // division here specifically because it is never stored or compared
  // again (the threshold check above it uses integer cross-multiplication,
  // the actual money-safety-critical comparison).
  increasePercent: number
  detectedAt: string
  currentTransactionId: string
}

function normalizeIdentityText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

// recurring_id is the strong, preferred identity signal (task's own
// instruction: "prefer using existing recurring templates first"). When
// absent, falls back to normalized merchant_name (or description, when no
// merchant_name is recorded) scoped to the same account — conservative
// and deterministic, never fuzzy: two rows must normalize to the exact
// same text and account to be treated as the same recurring bill.
// Deliberately does NOT try to reconcile a row that has merchant_name set
// with a row for the same real-world bill that only has description set —
// merging across different identity fields is exactly the kind of
// heuristic-guessing this milestone's brief warns against ("avoid false
// positives over aggressive detection... do NOT build fuzzy ML matching").
export function groupKeyForObservation(
  observation: Pick<RecurringChargeObservation, 'recurringId' | 'merchantName' | 'description' | 'accountId'>
): string | null {
  if (observation.recurringId) return `recurring:${observation.recurringId}`
  const text = observation.merchantName || observation.description
  const normalized = normalizeIdentityText(text)
  if (!normalized) return null
  return `text:${normalized}:${observation.accountId ?? 'none'}`
}

// Integer-safe median: even-length inputs floor the average of the two
// middle values rather than producing a fractional-agorot result — a
// baseline amount is compared against and reported as money, so it must
// stay an exact integer (CLAUDE.md § Money), never a float.
function medianAgorot(sortedAmounts: readonly number[]): number {
  const n = sortedAmounts.length
  const mid = Math.floor(n / 2)
  if (n % 2 === 1) return sortedAmounts[mid]!
  return Math.floor((sortedAmounts[mid - 1]! + sortedAmounts[mid]!) / 2)
}

// Recent-history window for the baseline, per the task's own "median /
// expected amount from recent prior observations" guidance — bounded so a
// bill with years of history isn't dragged down by a price from long
// before the current comparison is meaningful.
const BASELINE_WINDOW = 6

// Deterministic, pure — same input always produces the same output, no
// clock/random access, no network. Detects at most one increase per
// identity: the newest observation compared against a stable baseline of
// its own recent prior history.
export function detectPriceIncreases(
  observations: readonly RecurringChargeObservation[],
  threshold: PriceIncreaseThreshold = DEFAULT_PRICE_INCREASE_THRESHOLD
): PriceIncreaseDetection[] {
  // Only relevant, non-excluded EXPENSE observations participate:
  //   - amountAgorot < 0 excludes refunds/credits (posted with a positive
  //     sign, same convention as income) and the DB-disallowed 0 case.
  //   - isExcluded drops rows the household explicitly excluded from
  //     budget consideration — a bill they've marked "don't count this."
  // is_shared is deliberately NOT filtered on: CLAUDE.md is explicit that
  // is_shared is budget-attribution only, never a relevance/visibility
  // flag — a personal subscription's price increase is exactly as real
  // as a shared one's.
  const expenseObservations = observations.filter((o) => o.amountAgorot < 0 && !o.isExcluded)

  const groups = new Map<string, RecurringChargeObservation[]>()
  for (const observation of expenseObservations) {
    const key = groupKeyForObservation(observation)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(observation)
    else groups.set(key, [observation])
  }

  const detections: PriceIncreaseDetection[] = []

  for (const [key, group] of groups) {
    // A single observation is a one-off transaction, not yet a recurring
    // history to compare against — no baseline exists, so no detection.
    if (group.length < 2) continue

    // txnDate is always an unambiguous YYYY-MM-DD calendar date (matches
    // features/budgets/lib/budgetPeriod.ts's identical reasoning), so
    // lexicographic comparison is correct chronological order, including
    // across a year boundary. id is a stable tie-breaker for same-day rows.
    const sorted = [...group].sort((a, b) => a.txnDate.localeCompare(b.txnDate) || a.id.localeCompare(b.id))
    const current = sorted[sorted.length - 1]!
    const priorObservations = sorted.slice(0, -1).slice(-BASELINE_WINDOW)
    const priorAmounts = priorObservations.map((o) => -o.amountAgorot).sort((a, b) => a - b)
    const baselineAgorot = priorAmounts.length === 1 ? priorAmounts[0]! : medianAgorot(priorAmounts)
    const currentAmountAgorot = -current.amountAgorot

    const increaseAgorot = currentAmountAgorot - baselineAgorot
    if (increaseAgorot <= 0) continue // stable or a decrease — never an "increase" alert

    const meetsAbsolute = increaseAgorot >= threshold.minAbsoluteAgorot
    // Integer cross-multiplication (matches lib/money/arithmetic.ts's
    // hasReachedThresholdPercent pattern exactly) — never a float ratio
    // for the actual pass/fail decision.
    const meetsPercent = baselineAgorot > 0 && increaseAgorot * 100 >= baselineAgorot * threshold.minPercent
    if (!meetsAbsolute || !meetsPercent) continue

    const increasePercent = baselineAgorot > 0 ? Math.round((increaseAgorot / baselineAgorot) * 1000) / 10 : 0

    detections.push({
      identityKey: key,
      recurringId: current.recurringId,
      description: current.description,
      previousAmountAgorot: baselineAgorot,
      currentAmountAgorot,
      increaseAgorot,
      increasePercent,
      detectedAt: current.txnDate,
      currentTransactionId: current.id,
    })
  }

  return detections.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
}
