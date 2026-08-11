// Validates a single mapped CSV row BEFORE it is ever offered for import —
// this is the entire "validation happens before database writes" gate.
// Malformed rows never reach the preview as importable; they're reported
// with a specific reason instead. Reuses lib/money/format.ts's
// agorotFromILS for the actual numeric parsing (magnitude only — sign is
// resolved separately here, the same "sign derived, not typed" split
// already established for manual transaction entry).

import { agorotFromILS } from '@/lib/money/format'
import type { MappedCsvRow } from './mapCsvColumns'

export type ImportRowInvalidReason = 'invalid_date' | 'missing_description' | 'missing_amount' | 'invalid_amount'

export interface ValidImportRow {
  txnDate: string // YYYY-MM-DD, local calendar date — never derived via toISOString()
  description: string
  amountAgorot: number
}

export type ValidatedImportRow =
  | { valid: true; row: ValidImportRow }
  | { valid: false; reason: ImportRowInvalidReason }

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(year, month, 0).getDate()
}

// Accepts YYYY-MM-DD or DD/MM/YYYY (the two shapes Israeli bank CSV exports
// commonly use) — anything else is rejected, not guessed. Output is always
// YYYY-MM-DD, built from the matched numeric groups directly (never through
// `new Date(...).toISOString()`, which is UTC and could shift the day).
function parseImportDate(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (isoMatch) {
    const [, year, month, day] = isoMatch as unknown as [string, string, string, string]
    if (!isValidCalendarDate(Number(year), Number(month), Number(day))) return null
    return `${year}-${month}-${day}`
  }

  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed)
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch as unknown as [string, string, string, string]
    if (!isValidCalendarDate(Number(year), Number(month), Number(day))) return null
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return null
}

function resolveImportAmountAgorot(mapped: MappedCsvRow): { ok: true; agorot: number } | { ok: false } | null {
  const rawAmount = mapped.rawAmount?.trim()
  if (rawAmount) {
    const isNegative = rawAmount.startsWith('-')
    const magnitude = rawAmount.replace(/^[-+]/, '')
    const parsed = agorotFromILS(magnitude)
    if (!parsed.ok || parsed.agorot === null) return { ok: false }
    return { ok: true, agorot: isNegative ? -parsed.agorot : parsed.agorot }
  }

  const rawDebit = mapped.rawDebit?.trim()
  const rawCredit = mapped.rawCredit?.trim()
  const hasDebit = !!rawDebit
  const hasCredit = !!rawCredit

  if (hasDebit && hasCredit) return { ok: false } // ambiguous — both columns populated for one row
  if (hasDebit) {
    const parsed = agorotFromILS(rawDebit!)
    if (!parsed.ok || parsed.agorot === null) return { ok: false }
    return { ok: true, agorot: -parsed.agorot }
  }
  if (hasCredit) {
    const parsed = agorotFromILS(rawCredit!)
    if (!parsed.ok || parsed.agorot === null) return { ok: false }
    return { ok: true, agorot: parsed.agorot }
  }

  return null // no amount data present at all
}

export function validateImportRow(mapped: MappedCsvRow): ValidatedImportRow {
  const txnDate = parseImportDate(mapped.rawDate)
  if (!txnDate) return { valid: false, reason: 'invalid_date' }

  const description = mapped.rawDescription?.trim()
  if (!description) return { valid: false, reason: 'missing_description' }

  const amountResult = resolveImportAmountAgorot(mapped)
  if (amountResult === null) return { valid: false, reason: 'missing_amount' }
  if (!amountResult.ok) return { valid: false, reason: 'invalid_amount' }

  return { valid: true, row: { txnDate, description, amountAgorot: amountResult.agorot } }
}
