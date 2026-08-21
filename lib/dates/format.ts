// Display formatter for this app's canonical YYYY-MM-DD local-date strings
// (see features/budgets/lib/budgetPeriod.ts's localDateString — every date
// column in this app is a plain calendar-date string, never a timestamp).
// Pure string manipulation, no Date object parsing — there is no UTC-
// midnight footgun to guard against this way, the same reasoning
// components/ui/DatePickerField.tsx's own header comment documents for why
// it avoids `new Date(isoString)` for this app's date strings.
//
// Comprehensive upgrade pass: raw `YYYY-MM-DD` strings were being rendered
// directly across Recurring/Obligations/Cash Flow/Transactions, an
// inconsistent, non-Hebrew-reader-friendly format mixed in with every other
// screen's properly formatted currency figures. `DD.MM.YYYY` matches
// standard Israeli date convention.
export function formatDateDisplay(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const [, year, month, day] = match
  return `${day}.${month}.${year}`
}
