// Neither "how many instalments has this household paid" (display) nor
// "what index should forecasting resume from" (forecastInstallmentOccurrences.ts's
// lastMaterializedIndex input) is stored on installment_plans itself (unlike
// recurring's next_due_date column), so both are derived live from
// transactions the same way useAccountBalances.ts derives account balances
// live rather than trusting a stored counter. See the two functions below —
// they answer genuinely different questions and must never be conflated
// (RRR §14 P0-1).

export interface InstallmentMaterializedCountTransaction {
  installment_plan_id: string | null
}

export function computeInstallmentMaterializedCounts(
  transactions: readonly InstallmentMaterializedCountTransaction[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { installment_plan_id } of transactions) {
    if (!installment_plan_id) continue
    counts[installment_plan_id] = (counts[installment_plan_id] ?? 0) + 1
  }
  return counts
}

// RRR §14 P0-1: a DIFFERENT question from the row count above, and the two
// must never be conflated. computeInstallmentMaterializedCounts answers "how
// many instalments has this household actually paid" (correct for display —
// "3 of 12"). This answers "what is the highest instalment_index that
// already exists as a real transaction for this plan" — the only safe basis
// for "what index should forecasting resume from," because
// transactions_delete (migration 008) has no instalment-aware guard: an
// admin can delete any single materialized instalment, leaving a gap in the
// index sequence without lowering the count-vs-index relationship back into
// sync. Deriving "next index" from a row COUNT after such a gap would
// resume forecasting at an index that already exists as a real, posted
// transaction — a permanent, silent double-count. MAX is gap-safe and
// mirrors generate_installment_transactions()'s own
// `SELECT COALESCE(MAX(installment_index), 0) + 1` (migration 016) exactly,
// so the app-layer forecast can never resume at an index the database
// generator itself would not also resume at.
export interface InstallmentMaxIndexTransaction {
  installment_plan_id: string | null
  installment_index: number | null
}

export function computeInstallmentMaxIndices(
  transactions: readonly InstallmentMaxIndexTransaction[]
): Record<string, number> {
  const maxIndices: Record<string, number> = {}
  for (const { installment_plan_id, installment_index } of transactions) {
    if (!installment_plan_id || installment_index == null) continue
    maxIndices[installment_plan_id] = Math.max(maxIndices[installment_plan_id] ?? 0, installment_index)
  }
  return maxIndices
}
