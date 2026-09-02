import { describe, expect, it } from '@jest/globals'
import { formatDateDisplay, formatDayOfMonth, formatMonthAbbreviation } from './format'

describe('formatDateDisplay', () => {
  it('formats a YYYY-MM-DD string as DD.MM.YYYY', () => {
    expect(formatDateDisplay('2026-08-27')).toBe('27.08.2026')
  })

  it('pads single-digit day/month correctly (no double-padding, no truncation)', () => {
    expect(formatDateDisplay('2026-01-05')).toBe('05.01.2026')
  })

  // Defensive fallback — this app's date columns are always well-formed
  // YYYY-MM-DD strings (features/budgets/lib/budgetPeriod.ts's
  // localDateString), but returning the input unchanged for anything else
  // is safer than throwing or silently mangling unexpected data.
  it('returns the input unchanged for a non-matching string', () => {
    expect(formatDateDisplay('not-a-date')).toBe('not-a-date')
  })
})

describe('formatDayOfMonth', () => {
  it('pads a single-digit day, so a column of date blocks stays aligned', () => {
    expect(formatDayOfMonth('2026-09-04')).toBe('04')
  })

  it('leaves a two-digit day alone', () => {
    expect(formatDayOfMonth('2026-08-28')).toBe('28')
  })

  it('returns nothing for a value that is not an ISO date', () => {
    expect(formatDayOfMonth('28/08/2026')).toBe('')
    expect(formatDayOfMonth('')).toBe('')
  })
})

describe('formatMonthAbbreviation', () => {
  it('uses the fixed Hebrew abbreviations rather than whatever ICU has', () => {
    // Intl returns the full "אוגוסט" here, and which abbreviations exist at
    // all varies by ICU build — a date block that is 38px wide cannot take
    // that risk.
    expect(formatMonthAbbreviation('2026-08-28')).toBe('אוג׳')
    expect(formatMonthAbbreviation('2026-09-04')).toBe('ספט׳')
    expect(formatMonthAbbreviation('2026-01-01')).toBe('ינו׳')
    expect(formatMonthAbbreviation('2026-12-31')).toBe('דצמ׳')
  })

  it('returns nothing for a value that is not an ISO date', () => {
    expect(formatMonthAbbreviation('not-a-date')).toBe('')
  })
})
