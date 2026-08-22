// Projects future instalment-plan occurrences within a horizon, without
// creating any transaction and without duplicating the amount/date math —
// mirrors forecastRecurringOccurrences.ts's shape and double-count-guard
// reasoning exactly (ADR-037), for the same reason: a not-yet-materialized
// instalment is purely a forecast number, never a transaction, never summed
// into realized spending (docs/DATABASE_SCHEMA.md's "what MVP must avoid").
//
// Double-count guard: forecasting starts from the FIRST not-yet-materialized
// index (materializedCount + 1), never from installmentIndex 1. This
// mirrors recurring's own guard — generate_installment_transactions()
// (migration 016) always materializes every instalment whose charge date has
// already arrived, and (once mounted the same way
// useGenerateRecurringTransactions is, in app/(app)/_layout.tsx) runs on
// every app load — so a forecasted occurrence can never also already exist
// as a posted transaction.
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

function addMonthClamped(isoDate: string, months: number): string {
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
  // How many instalments already exist as real, materialized transactions
  // for this plan (derived by the caller, e.g. count of transactions with
  // this installment_plan_id) — the exact analogue of RecurringForecastTemplate's
  // nextDueDate: forecasting always resumes from materializedCount + 1.
  materializedCount: number
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
    for (let index = plan.materializedCount + 1; index <= plan.installmentCount; index++) {
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
