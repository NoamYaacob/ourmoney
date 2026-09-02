// The ONLY place a monetary integer becomes a display string, and the ONE
// sanctioned boundary where a float touches money at all — see CLAUDE.md
// § Money. agorotFromILS's Math.round(ils * 100) converts raw keyboard input
// to an integer immediately; the value is never touched as a float again
// after that single line. Do not misflag this as a float-arithmetic
// violation — it is the documented conversion boundary, not computation.

const ILS_FORMATTER = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 2,
})

export function formatILS(agorot: number): string {
  // Comprehensive upgrade pass: a caller that negates a sum which happens to
  // be exactly 0 (e.g. `-safeToSpend.plannedObligationsAgorot` when a
  // household has no upcoming obligations) produces JS's `-0`, not `0` —
  // `-0 === 0` but `Intl.NumberFormat` still renders it with a sign,
  // producing a spurious "-₪0.00". Normalized here, centrally, rather than
  // requiring every call site to remember the `-x || 0` guard
  // lib/money/arithmetic.ts's spentAgorotFromExpenses already applies
  // locally — every renderer of a monetary figure goes through this one
  // function (CLAUDE.md § Money), so fixing it here fixes every call site,
  // present and future.
  const normalizedAgorot = agorot === 0 ? 0 : agorot
  return ILS_FORMATTER.format(normalizedAgorot / 100)
}

// The design system's `ratio` style (§08): "3,820 / 4,500 ₪" — a budget row's
// spent-against-allocated, where repeating the currency on both operands is
// noise. It is not a second money formatter: it renders through the same
// `formatILS` for the part that carries the currency, and the bare part is
// the same grouped number without the symbol.
//
// The pair has to be built here rather than interpolated in a translation
// string. `formatILS` output begins with U+200F (RLM) and ends with ₪, so
// two of them either side of a "/" form two strong-RTL runs and the bidi
// algorithm renders them in the opposite visual order — a row reading
// "4,500 / 926" when the household spent 926 of 4,500. Isolating the whole
// ratio in one LTR run (U+2066 … U+2069) keeps the operands in the order
// they were written, which is the order the design draws.
const BARE_FORMATTER = new Intl.NumberFormat('he-IL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatRatioILS(spentAgorot: number, totalAgorot: number): string {
  const spent = BARE_FORMATTER.format((spentAgorot === 0 ? 0 : spentAgorot) / 100)
  return `\u2066${spent} / ${formatILS(totalAgorot)}\u2069`
}

const MAX_ILS = 10_000_000

export interface AgorotParseResult {
  ok: boolean
  agorot: number | null
  error: 'invalid' | 'not_positive' | 'too_large' | 'too_many_decimals' | null
}

// Canonical amount-entry parser (D10): the user always types a positive ILS
// figure; sign is derived elsewhere from category/transaction semantics,
// never typed directly. Rejects NaN/Infinity/negative/overflow/too-many-
// decimal input rather than silently coercing or clamping it.
export function agorotFromILS(raw: string): AgorotParseResult {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    const looksNumeric = /^\d+\.\d{3,}$/.test(trimmed)
    return { ok: false, agorot: null, error: looksNumeric ? 'too_many_decimals' : 'invalid' }
  }

  const ils = Number(trimmed)
  if (!Number.isFinite(ils)) {
    return { ok: false, agorot: null, error: 'invalid' }
  }
  if (ils <= 0) {
    return { ok: false, agorot: null, error: 'not_positive' }
  }
  if (ils > MAX_ILS) {
    return { ok: false, agorot: null, error: 'too_large' }
  }

  return { ok: true, agorot: Math.round(ils * 100), error: null }
}
