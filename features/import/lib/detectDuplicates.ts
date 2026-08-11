// Exact-match duplicate detection only — account_id + txn_date +
// amount_agorot + normalized(description). No fuzzy matching in M7 (per the
// approved M7 design). Normalization is conservative: trim surrounding
// whitespace and collapse repeated internal whitespace — nothing else.
// Structured fields (account_id/txn_date/amount_agorot) are compared as-is,
// with no normalization applicable to them.

import type { ValidImportRow } from './validateImportRow'

export interface ExistingTransactionForDedup {
  accountId: string
  txnDate: string
  amountAgorot: number
  description: string
}

export function normalizeDescriptionForDedup(description: string): string {
  return description.trim().replace(/\s+/g, ' ')
}

export function isDuplicateCandidate(
  candidate: ValidImportRow,
  accountId: string,
  existing: readonly ExistingTransactionForDedup[]
): boolean {
  const normalizedCandidateDescription = normalizeDescriptionForDedup(candidate.description)
  return existing.some(
    (row) =>
      row.accountId === accountId &&
      row.txnDate === candidate.txnDate &&
      row.amountAgorot === candidate.amountAgorot &&
      normalizeDescriptionForDedup(row.description) === normalizedCandidateDescription
  )
}
