// Generic preamble tolerance (Milestone A). Many real bank/card CSV
// exports prepend an account-summary or title block before the real header
// row — this is a plain user-specified "how many rows come before the
// header" number, defaulting to 0 (today's exact behavior: row 0 is the
// header). No bank auto-detection here — that's institution-profile work
// for a later milestone, once real sample exports exist.

export interface HeaderOffsetResult {
  headers: string[]
  rows: string[][]
}

// `table` is the FULL parsed file (header row and data rows together,
// nothing pre-split) — see import.tsx for why it's reassembled that way
// after parseCsv.ts, which is left untouched by this milestone.
export function applyHeaderOffset(table: readonly string[][], headerOffset: number): HeaderOffsetResult {
  const clamped = Math.max(0, Math.min(Math.trunc(headerOffset) || 0, table.length))
  const headers = table[clamped] ?? []
  const rows = table.slice(clamped + 1).map((row) => [...row])
  return { headers: [...headers], rows }
}
