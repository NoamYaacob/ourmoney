// CP8D — Household Lens: שלנו | שלי | שלך.
//
// A PRESENTATION lens over the household's existing data — never a second
// accounting, never privacy, never row-level permissions, never per-member
// Safe-to-Spend. Every function here is pure and derives its answer only
// from real, already-collected fields (`household_members`, and — the one
// genuinely attributable financial field found during this checkpoint's own
// audit — `transactions.payer_id`, which the "who paid" selector on
// features/transactions/hooks/useCreateTransaction.ts already writes on
// every transaction, defaulting to its own creator and user-overridable).
//
// What is NOT here, and why: `recurring_transactions`, `planned_obligations`
// and `installment_plans` (the three sources `calculateCashFlowForecast.ts`
// ever draws a `CashFlowForecastEvent` from) carry only `created_by` (who
// typed the record into the app — not necessarily whose expense it is) and
// `is_shared` (budget attribution only, per CLAUDE.md's "never overload a
// boolean" rule — it says shared-vs-personal, never says WHICH person).
// `accounts.owner_id` exists in the schema but no real production form ever
// sets it (features/accounts — no owner picker exists), so it is always
// null in practice; treating it as attribution would be inferring ownership
// the real app never actually collects. `savings_goals` and
// `financial_alerts` (computed, never persisted) carry no member field at
// all. None of these are touched by this module — every one of those
// surfaces stays deliberately household-level, per this checkpoint's own
// explicit instruction: "if a surface cannot be truthfully attributed,
// leave it household-level."

export type HouseholdLens = 'shared' | 'me' | 'partner'

export const DEFAULT_HOUSEHOLD_LENS: HouseholdLens = 'shared'

export interface LensMember {
  userId: string
  displayName: string
}

export interface LensOption {
  lens: HouseholdLens
  // The real display name(s) behind this option, already resolved from
  // `useHouseholdMembers` — never a hardcoded "נועם"/"דנה". `null` for
  // 'shared' (it has no single name) and for a 3+-member household's
  // 'partner' option (see the file header — a truthful "others" grouping
  // rather than an arbitrarily-named individual).
  memberNames: string[] | null
}

// The lens control has no meaningful third (or even second) state to offer
// when there is no genuine "you" to distinguish from "them" — a single-
// member household has nothing for שלי/שלך to mean. Returns exactly one
// option (`shared`) in that case; callers use this to decide whether the
// control itself is worth showing at all (CP8D §12: prefer hiding a
// meaningless control over showing it with a dead option).
export function buildLensOptions(members: readonly LensMember[], currentUserId: string | null | undefined): LensOption[] {
  const shared: LensOption = { lens: 'shared', memberNames: null }
  if (!currentUserId || members.length <= 1) return [shared]

  const others = members.filter((m) => m.userId !== currentUserId)
  if (others.length === 0) return [shared]

  // Exactly one other real member: שלך names them specifically — the
  // common, MVP-optimized-for-two case (CLAUDE.md's own framing).
  // 3+ members: naming one arbitrarily would misattribute the other N-2 —
  // "partner" becomes a truthful aggregate of every other real member
  // instead, per this checkpoint's own "do not invent behavior for 3+
  // members" instruction.
  const partnerNames = others.map((m) => m.displayName)

  return [
    shared,
    { lens: 'me', memberNames: [members.find((m) => m.userId === currentUserId)?.displayName ?? ''] },
    { lens: 'partner', memberNames: partnerNames },
  ]
}

// The set of user ids the given lens treats as "primary" — `null` means
// "no filtering" (שלנו, or a degenerate single-member household where the
// lens has nothing to distinguish). Never returns an empty array: a lens
// with nobody behind it is `null`, not a set that would silently
// de-emphasize everything.
export function resolveLensAttributedUserIds(
  lens: HouseholdLens,
  members: readonly LensMember[],
  currentUserId: string | null | undefined
): string[] | null {
  if (lens === 'shared' || !currentUserId) return null
  if (lens === 'me') return [currentUserId]
  const others = members.filter((m) => m.userId !== currentUserId).map((m) => m.userId)
  return others.length > 0 ? others : null
}

export type RowEmphasis = 'normal' | 'quiet'

// The one rule every attribution-aware row in this checkpoint uses.
// `attributedUserIds === null` (שלנו, or nothing to distinguish) → always
// normal. A row whose real `payerId` is unknown (null/undefined) is NEVER
// de-emphasized — CP8D's own explicit rule: an unattributable row must
// never be quietly treated as "not yours" when it might well be. Only a
// row with a real, known payer that is genuinely outside the selected
// lens's own set gets the quieter treatment — and it stays fully present
// and interactive; this function only ever returns a display hint, never a
// visibility decision.
export function resolveRowEmphasis(payerId: string | null | undefined, attributedUserIds: string[] | null): RowEmphasis {
  if (attributedUserIds === null) return 'normal'
  if (!payerId) return 'normal'
  return attributedUserIds.includes(payerId) ? 'normal' : 'quiet'
}
