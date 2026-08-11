// Reference/testable implementation of the exact date-advancement algorithm
// migration 003's advance_recurring_due_date() SQL function implements. This
// TypeScript version is NOT used for the actual mutation — the DB function
// is authoritative there (see generate_recurring_transactions()'s header:
// the client sends no generation-specific input at all). This file exists
// for (a) client-side "next due: Feb 28" preview display with no round
// trip, and (b) as the spec the SQL must match — parity is proven by
// running the identical fixture table against both implementations
// (recurringDueDate.test.ts here; the DB.PARITY.* group in rls_tests.sql
// calling advance_recurring_due_date() directly with the same inputs).
//
// Correctness rule, the one that actually matters: every step always
// re-derives from the template's ORIGINAL dayOfMonth, never from the day-of-
// month of the previous computed due date. A template due on the 31st that
// lands on Feb 28 must return to the 31st in March, not drift permanently to
// the 28th. Getting this backwards (deriving from the previous due date) is
// the specific bug this file's tests are designed to catch.

import type { RecurringFrequency } from '@/types/app'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateString(year: number, month1: number, day: number): string {
  // month1 is 1-based; Date's constructor takes 0-based months.
  return `${year}-${pad2(month1)}-${pad2(day)}`
}

function daysInMonth(year: number, month1: number): number {
  // Day 0 of the following month = last day of this month (local, no
  // timezone involved — every input/output here is a plain YYYY-MM-DD
  // calendar date, never a Date constructed from an ISO/UTC string).
  return new Date(year, month1, 0).getDate()
}

function stepMonths(dueDate: string, frequency: 'monthly' | 'quarterly' | 'yearly', dayOfMonth: number): string {
  const [year, month] = dueDate.split('-').map(Number) as [number, number]
  const stepCount = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12
  const totalMonths = (month - 1) + stepCount
  const targetYear = year + Math.floor(totalMonths / 12)
  const targetMonth1 = (totalMonths % 12) + 1
  const clampedDay = Math.min(dayOfMonth, daysInMonth(targetYear, targetMonth1))
  return toDateString(targetYear, targetMonth1, clampedDay)
}

function addDays(dueDate: string, days: number): string {
  const [year, month, day] = dueDate.split('-').map(Number) as [number, number, number]
  const next = new Date(year, month - 1, day + days)
  return toDateString(next.getFullYear(), next.getMonth() + 1, next.getDate())
}

// dayOfMonth is null for daily/weekly/biweekly frequencies (the DB column
// allows NULL for those — only monthly/quarterly/yearly require it).
export function advanceDueDate(dueDate: string, frequency: RecurringFrequency, dayOfMonth: number | null): string {
  switch (frequency) {
    case 'daily':
      return addDays(dueDate, 1)
    case 'weekly':
      return addDays(dueDate, 7)
    case 'biweekly':
      return addDays(dueDate, 14)
    case 'monthly':
    case 'quarterly':
    case 'yearly': {
      if (dayOfMonth === null) {
        throw new Error(`recurring frequency "${frequency}" requires a dayOfMonth`)
      }
      return stepMonths(dueDate, frequency, dayOfMonth)
    }
  }
}

export interface RecurringPreviewTemplate {
  id: string
  dueDate: string
  frequency: RecurringFrequency
  dayOfMonth: number | null
}

// Client-side "what would generation do right now" preview — used only for
// display (e.g. a recurring template list row showing "הבא: 28 בפברואר"),
// never for the actual mutation. Loops the same way the DB function's inner
// WHILE loop does, so the preview count matches what a real generation call
// would produce.
export function previewDueOccurrences(template: RecurringPreviewTemplate, today: string): string[] {
  const occurrences: string[] = []
  let cursor = template.dueDate
  while (cursor <= today) {
    occurrences.push(cursor)
    cursor = advanceDueDate(cursor, template.frequency, template.dayOfMonth)
  }
  return occurrences
}
