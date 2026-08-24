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

// `DD.MM`, no year — the desktop Home hero's commitment timeline labels
// each dot this way (`OurMoney - Desktop.dc.html`: "28.08", "01.09"), a
// narrower stamp than `formatDateDisplay` for a label with only ~44px to
// sit in above a dot, where a household already knows which year it's in.
export function formatDateShort(isoDate: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const [, month, day] = match
  return `${day}.${month}`
}

// Hebrew month abbreviation for the design's commitment row, which stacks a
// large day numeral over a short month ("28" over "אוג׳").
//
// A hand-written table rather than `Intl.DateTimeFormat('he-IL', { month:
// 'short' })`: Intl returns the full month name for Hebrew in most ICU
// builds ("אוגוסט"), which is far too wide for the 42px date block the
// design specifies, and the result varies by platform and ICU version.
// Twelve fixed strings are stable everywhere and match the mockup exactly.
const MONTH_ABBREVIATIONS = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳',
] as const

export function formatMonthAbbreviation(isoDate: string): string {
  const match = /^\d{4}-(\d{2})-\d{2}$/.exec(isoDate)
  if (!match) return ''
  return MONTH_ABBREVIATIONS[Number(match[1]) - 1] ?? ''
}

// The day-of-month for that same block, zero-padded — "04", not "4".
//
// Padded on purpose: the date block is a fixed-width column of tabular
// figures down a list, and an unpadded single digit sits visibly off-centre
// beside two-digit neighbours. Every date block in both design files is
// padded ("04.09", "28"), and the ISO string already carries the padding, so
// this is a slice rather than a format.
export function formatDayOfMonth(isoDate: string): string {
  const match = /^\d{4}-\d{2}-(\d{2})$/.exec(isoDate)
  return match ? (match[1] as string) : ''
}
