import { describe, expect, it } from '@jest/globals'
import { formatDateDisplay } from './format'

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
