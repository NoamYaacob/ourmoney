// Projects future recurring-transaction occurrences within a horizon,
// without creating any transaction and without duplicating the recurrence
// date math — every step is delegated to features/recurring/lib/
// recurringDueDate.ts's advanceDueDate, the same pure function the app
// already uses for "next due" preview display and that is proven to match
// migration 003's generate_recurring_transactions() step-for-step.
//
// Double-count guard: forecasting starts from each template's OWN
// next_due_date, never from "today." next_due_date is, by construction, the
// earliest occurrence NOT YET inserted as a transaction row — migration
// 003's generate_recurring_transactions() always advances it past every
// occurrence up to and including CURRENT_DATE before returning, and that
// generation runs app-wide on every load (useGenerateRecurringTransactions,
// mounted in app/(app)/_layout.tsx). So an occurrence this function reports
// can never also already exist as a posted transaction — no cross-check
// against transactions.source='recurring' is needed. (If generation
// genuinely has not run yet this session and next_due_date is in the past,
// that occurrence's money has not left the account either — it is still
// correctly "upcoming," not a double count.)
//
// Only EXPENSE templates (signed amountAgorot < 0) reserve cash — an income
// recurring template (e.g. a recurring transfer in) does not reduce
// Safe-to-Spend. Inactive templates never forecast.
//
// Defensive against a malformed template: advanceDueDate throws for
// monthly/quarterly/yearly frequencies when dayOfMonth is null (a state the
// schema's CHECK constraint alone does not prevent — day_of_month has no
// NOT NULL tied to frequency). This engine is the first real render-path
// caller of advanceDueDate (previously only used for optimistic "next due"
// preview text, never inside a computation an uncaught throw could take
// down); a display-only aggregate must degrade one bad row, not crash the
// whole app. A template that would throw is skipped entirely — its
// occurrences simply don't appear in the reservation, the same as any other
// filtered-out template (inactive, income-signed).

import { advanceDueDate } from '@/features/recurring/lib/recurringDueDate'
import type { RecurringFrequency } from '@/types/app'

const FREQUENCIES_REQUIRING_DAY_OF_MONTH: ReadonlySet<RecurringFrequency> = new Set(['monthly', 'quarterly', 'yearly'])

export interface RecurringForecastTemplate {
  id: string
  description: string
  // Signed, exactly as stored on recurring_transactions.amount_agorot.
  amountAgorot: number
  frequency: RecurringFrequency
  dayOfMonth: number | null
  nextDueDate: string
  isActive: boolean
  categoryId: string | null
  accountId: string | null
}

export interface ForecastedRecurringOccurrence {
  recurringId: string
  description: string
  // Always positive — the amount reserved, not a signed ledger movement.
  amountAgorot: number
  date: string
  categoryId: string | null
  accountId: string | null
}

export function forecastRecurringOccurrences(
  templates: readonly RecurringForecastTemplate[],
  horizonEnd: string
): ForecastedRecurringOccurrence[] {
  const occurrences: ForecastedRecurringOccurrence[] = []

  for (const template of templates) {
    if (!template.isActive) continue
    if (template.amountAgorot >= 0) continue
    if (FREQUENCIES_REQUIRING_DAY_OF_MONTH.has(template.frequency) && template.dayOfMonth === null) continue

    let cursor = template.nextDueDate
    while (cursor <= horizonEnd) {
      occurrences.push({
        recurringId: template.id,
        description: template.description,
        amountAgorot: -template.amountAgorot,
        date: cursor,
        categoryId: template.categoryId,
        accountId: template.accountId,
      })
      cursor = advanceDueDate(cursor, template.frequency, template.dayOfMonth)
    }
  }

  return occurrences
}
