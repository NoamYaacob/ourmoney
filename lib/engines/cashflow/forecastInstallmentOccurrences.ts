// Projects future instalment-plan occurrences within a horizon, without
// creating any transaction and without duplicating the amount/date math —
// mirrors forecastRecurringOccurrences.ts's shape and double-count-guard
// reasoning exactly (ADR-037), for the same reason: a not-yet-materialized
// instalment is purely a forecast number, never a transaction, never summed
// into realized spending (docs/DATABASE_SCHEMA.md's "what MVP must avoid").
//
// Double-count guard: forecasting starts from the FIRST not-yet-materialized
// index (lastMaterializedIndex + 1), never from installmentIndex 1. This
// mirrors recurring's own guard — generate_installment_transactions()
// (migration 016) always materializes every instalment whose charge date has
// already arrived, and (once mounted the same way
// useGenerateRecurringTransactions is, in app/(app)/_layout.tsx) runs on
// every app load — so a forecasted occurrence can never also already exist
// as a posted transaction, PROVIDED the caller passes a gap-safe
// lastMaterializedIndex.
//
// RRR §14 P0-1: this field is deliberately named lastMaterializedIndex, not
// materializedCount, and callers MUST derive it as MAX(installment_index)
// over this plan's real transactions — never a row count. A row count
// silently diverges from the true next index the instant any single
// materialized instalment is deleted (transactions_delete has no
// instalment-aware guard, migration 008), because the remaining rows keep
// their original indices rather than collapsing to fill the gap. Feeding a
// row count here would resume forecasting at an index that already exists
// as a real, posted transaction — a permanent, silent double-count in every
// engine that consumes this forecast (Safe-to-Spend, the cash-flow
// forecast, Upcoming Commitments, Impact Check). See
// computeInstallmentMaterializedCounts.ts's computeInstallmentMaxIndices,
// the one function in this codebase that is safe to derive this value from.
//
// Date math mirrors generate_installment_transactions()'s own SQL exactly:
// `first_charge_date + ((index - 1) * INTERVAL '1 month')`, computed fresh
// from the plan's own immutable first_charge_date every time (never
// cumulative from the previous computed date, which would let rounding
// drift accumulate). Postgres's date+interval arithmetic CLAMPS an
// overflowing day-of-month to the last day of the target month (e.g. Jan 31
// + 1 month = Feb 28) rather than rolling into the following month —
// addMonthClamped below replicates that exact behavior, the same
// SQL-authoritative/TS-mirror discipline advanceDueDate/
// recurringDueDate.ts's DB.PARITY tests already established for recurring
// transactions.
//
// The last instalment absorbs the floor-division remainder, exactly
// matching the generator's own computation — never re-derived by a second,
// potentially-divergent formula.

// Exported so a screen can name the date of a specific instalment (the next
// one due, the last one of the plan) without re-deriving month arithmetic
// that has to stay identical to the generator's SQL. One implementation of
// `first_charge_date + n months`, and this is it.
export function addMonthClamped(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  const totalMonths = month - 1 + months
  const targetYear = year + Math.floor(totalMonths / 12)
  const targetMonthIndex = ((totalMonths % 12) + 12) % 12
  // Day 0 of the month AFTER the target month = the last real day of the
  // target month (same trick features/budgets/lib/budgetPeriod.ts's
  // getPeriodEnd already uses).
  const daysInTargetMonth = new Date(targetYear, targetMonthIndex + 1, 0).getDate()
  const targetDay = Math.min(day, daysInTargetMonth)
  const pad2 = (n: number) => String(n).padStart(2, '0')
  return `${targetYear}-${pad2(targetMonthIndex + 1)}-${pad2(targetDay)}`
}

export interface InstallmentPlanForecastTemplate {
  id: string
  description: string
  // Always positive, as stored on installment_plans.total_agorot/monthly_agorot.
  totalAgorot: number
  installmentCount: number
  monthlyAgorot: number
  firstChargeDate: string
  // The highest installment_index that already exists as a real,
  // materialized transaction for this plan — MAX, never a row COUNT (see
  // the module header comment for why the two diverge after a delete).
  // Derived by the caller via computeInstallmentMaxIndices. The exact
  // analogue of RecurringForecastTemplate's nextDueDate: forecasting always
  // resumes from lastMaterializedIndex + 1.
  lastMaterializedIndex: number
  categoryId: string | null
  accountId: string | null
}

export interface ForecastedInstallmentOccurrence {
  installmentPlanId: string
  description: string
  // Always negative — an instalment is always an expense (a credit-card
  // purchase), never income; installment_plans has no signed/income concept
  // at all, matching migration 016's model.
  amountAgorot: number
  installmentIndex: number
  date: string
  categoryId: string | null
  accountId: string | null
}

export function forecastInstallmentOccurrences(
  plans: readonly InstallmentPlanForecastTemplate[],
  horizonEnd: string
): ForecastedInstallmentOccurrence[] {
  const occurrences: ForecastedInstallmentOccurrence[] = []

  for (const plan of plans) {
    for (let index = plan.lastMaterializedIndex + 1; index <= plan.installmentCount; index++) {
      const date = addMonthClamped(plan.firstChargeDate, index - 1)
      if (date > horizonEnd) break

      const amountAgorot =
        index === plan.installmentCount
          ? plan.totalAgorot - plan.monthlyAgorot * (plan.installmentCount - 1)
          : plan.monthlyAgorot

      occurrences.push({
        installmentPlanId: plan.id,
        description: plan.description,
        amountAgorot: -amountAgorot,
        installmentIndex: index,
        date,
        categoryId: plan.categoryId,
        accountId: plan.accountId,
      })
    }
  }

  return occurrences
}
