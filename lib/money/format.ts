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
  return ILS_FORMATTER.format(agorot / 100)
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
