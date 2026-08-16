// Validates a single mapped CSV row BEFORE it is ever offered for import —
// this is the entire "validation happens before database writes" gate.
// Malformed rows never reach the preview as importable; they're reported
// with a specific reason instead. Amount parsing goes through
// normalizeImportAmount.ts (Milestone A), which itself delegates the final
// numeric parse to lib/money/format.ts's agorotFromILS — one parser, one
// set of money-parsing invariants, reused rather than duplicated.

import type { MappedCsvRow } from './mapCsvColumns'
import { isZeroOrBlankImportAmount, normalizeImportAmount } from './normalizeImportAmount'

export type ImportRowInvalidReason = 'invalid_date' | 'missing_description' | 'missing_amount' | 'invalid_amount'

export interface ValidImportRow {
  txnDate: string // YYYY-MM-DD, local calendar date — never derived via toISOString()
  description: string
  merchantName: string | null
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
    const parsed = normalizeImportAmount(rawAmount)
    if (!parsed.ok || parsed.agorot === null) return { ok: false }
    return { ok: true, agorot: parsed.agorot }
  }

  const rawDebit = mapped.rawDebit?.trim()
  const rawCredit = mapped.rawCredit?.trim()
  // Milestone A fix: blank / 0 / 0.0 / 0.00 all count as "this side is
  // absent" — only a genuinely non-zero value on BOTH sides is ambiguous.
  // A bank that zero-fills its unused debit/credit column (rather than
  // leaving it blank) must not trip a false ambiguous-row rejection.
  const hasDebit = !!rawDebit && !isZeroOrBlankImportAmount(rawDebit)
  const hasCredit = !!rawCredit && !isZeroOrBlankImportAmount(rawCredit)

  if (hasDebit && hasCredit) return { ok: false } // ambiguous — both sides have a real, non-zero value
  if (hasDebit) {
    const parsed = normalizeImportAmount(rawDebit!)
    if (!parsed.ok || parsed.agorot === null) return { ok: false }
    return { ok: true, agorot: -Math.abs(parsed.agorot) }
  }
  if (hasCredit) {
    const parsed = normalizeImportAmount(rawCredit!)
    if (!parsed.ok || parsed.agorot === null) return { ok: false }
    return { ok: true, agorot: Math.abs(parsed.agorot) }
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

  const merchantName = mapped.rawMerchant?.trim() || null

  return { valid: true, row: { txnDate, description, merchantName, amountAgorot: amountResult.agorot } }
}
