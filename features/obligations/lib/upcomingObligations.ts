import type { PlannedObligationStatus } from '@/types/app'

export interface ObligationForSort {
  id: string
  dueDate: string
  status: PlannedObligationStatus
}

// Upcoming obligations, nearest due date first — the one list shape the
// index screen needs. Plain string comparison is correct and sufficient:
// dueDate is always an unambiguous YYYY-MM-DD calendar date (matches
// features/budgets/lib/budgetPeriod.ts's identical reasoning for
// periodStart), so lexicographic order is chronological order.
export function filterUpcomingObligations<T extends ObligationForSort>(obligations: readonly T[]): T[] {
  return obligations.filter((o) => o.status === 'upcoming').slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

// today is passed in (never read from `new Date()` here) so this stays a
// pure, deterministic function — the caller supplies "today" via
// features/budgets/lib/budgetPeriod.ts's localDateString(), the app's one
// established source of "what day is it, in local time."
export function isPastDue(dueDate: string, today: string): boolean {
  return dueDate < today
}

// Comprehensive upgrade pass: "בעוד X ימים" ("in X days") on the
// obligations list card and the Dashboard's upcoming-commitments widget —
// both explicitly requested alongside the existing due-date display, not a
// replacement for it. Local-midnight `Date` construction (no 'Z' suffix),
// matching components/ui/DatePickerField.tsx's own documented reasoning for
// why this app never parses a YYYY-MM-DD string as UTC. Returns a signed
// day count — 0 for "due today," negative for already past due (callers
// needing an explicit past-due check should still use isPastDue above,
// which reads as intent more clearly than `daysUntilDue(...) < 0`).
export function daysUntilDue(dueDate: string, today: string): number {
  const dueDateMs = new Date(`${dueDate}T00:00:00`).getTime()
  const todayMs = new Date(`${today}T00:00:00`).getTime()
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round((dueDateMs - todayMs) / MS_PER_DAY)
}
