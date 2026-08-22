// forecastInstallmentOccurrences.ts's materializedCount input — "how many
// instalments already exist as real, materialized transactions for this
// plan" — is never stored on installment_plans itself (unlike recurring's
// next_due_date column), so it is derived live from transactions the same
// way useAccountBalances.ts derives account balances live rather than
// trusting a stored counter.

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
