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
