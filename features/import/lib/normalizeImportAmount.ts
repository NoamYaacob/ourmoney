// Import-specific amount normalization — real financial CSV exports use
// shapes lib/money/format.ts's agorotFromILS was never meant to accept
// (thousands separators, parenthesized negatives). Deliberately NOT
// broadening agorotFromILS itself, which stays the single strict parser for
// manual money entry (CLAUDE.md's Money rules — the app's canonical
// amount-typing boundary). This module only reshapes import text into the
// plain digits[.digits] form agorotFromILS already accepts, then delegates
// the actual numeric parse to it — one parser, one set of money-parsing
// invariants (max value, decimal places), reused rather than duplicated.

import { agorotFromILS } from '@/lib/money/format'

export interface ImportAmountResult {
  ok: boolean
  agorot: number | null
}

const GROUPED_MAGNITUDE = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/
const PLAIN_MAGNITUDE = /^\d+(\.\d{1,2})?$/

// Returns the sign-stripped, comma-stripped magnitude string agorotFromILS
// can parse, or null if the shape isn't one of the two unambiguous forms
// this importer supports: proper 3-digit thousands grouping ("1,234.56"),
// or no grouping at all ("1234.56").
function extractMagnitude(text: string): string | null {
  if (GROUPED_MAGNITUDE.test(text)) return text.replace(/,/g, '')
  if (PLAIN_MAGNITUDE.test(text)) return text
  return null
}

// Locale-ambiguity note: a raw string like "123,45" is rejected outright,
// never guessed as either "12,345" (a thousands group missing digits) or
// "123.45" (comma used as a decimal separator) — both are plausible
// readings in different locales, and silently picking one risks misparsing
// real money. Only the two unambiguous shapes above are accepted; anything
// else surfaces as invalid_amount for the user to see, not a silent guess.
export function normalizeImportAmount(raw: string): ImportAmountResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, agorot: null }

  const parenMatch = /^\((.+)\)$/.exec(trimmed)
  const isNegativeParens = parenMatch !== null
  const withoutParens = parenMatch?.[1]?.trim() ?? trimmed

  const signMatch = /^([-+])(.+)$/.exec(withoutParens)
  const isNegativeSign = signMatch?.[1] === '-'
  const unsigned = signMatch?.[2]?.trim() ?? withoutParens

  const magnitude = extractMagnitude(unsigned)
  if (magnitude === null) return { ok: false, agorot: null }

  const parsed = agorotFromILS(magnitude)
  if (!parsed.ok || parsed.agorot === null) return { ok: false, agorot: null }

  return { ok: true, agorot: isNegativeParens || isNegativeSign ? -parsed.agorot : parsed.agorot }
}

// Textual zero/blank check, independent of the full parse above (which
// rejects zero outright via agorotFromILS's "not_positive" guard, so it
// can't itself distinguish "this cell is zero" from "this cell is
// garbage"). Used only to decide whether a debit/credit column counts as
// "populated" for ambiguity detection — a 0/0.0/0.00-filled side must
// behave the same as a blank one, per Milestone A's debit/credit fix.
const ZERO_MAGNITUDE = /^0+(\.0*)?$/

export function isZeroOrBlankImportAmount(raw: string | null | undefined): boolean {
  if (!raw) return true
  const trimmed = raw.trim()
  if (!trimmed) return true

  const withoutParens = /^\((.+)\)$/.exec(trimmed)?.[1]?.trim() ?? trimmed
  const withoutSign = /^[-+](.+)$/.exec(withoutParens)?.[1]?.trim() ?? withoutParens
  return ZERO_MAGNITUDE.test(withoutSign.replace(/,/g, ''))
}
