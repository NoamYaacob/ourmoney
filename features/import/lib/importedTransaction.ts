// Canonical import-layer transaction shape (Milestone A scaffolding). This
// is intentionally richer than what gets persisted today — see the CSV
// import architecture report §6/§7 for the full field-by-field
// persist-vs-import-only breakdown. No transactions table column changes
// happen in this milestone; every optional field below has nowhere to
// persist to yet and stays import-only metadata.
//
// ValidImportRow (validateImportRow.ts) remains today's concrete working
// type through preview/dedup/commit — this file does not replace it. This
// is the superset shape a future institution profile (richer source data:
// posting date, currency, installment info, a bank's own reference id)
// will eventually target, with toImportedTransaction bridging the two.

export interface ImportedTransaction {
  txnDate: string // YYYY-MM-DD — the only date persisted today
  postingDate?: string | null // import-only; no DB column yet
  description: string
  merchantName?: string | null // persisted via useCreateTransaction's merchantName
  amountAgorot: number
  currency?: string | null // import-only; OurMoney is ILS-only today
  sourceProfileId?: string | null // import-only; which ImportProfile (if any) produced this row
  sourceReferenceId?: string | null // import-only; the institution's own transaction/reference id, when present
  installmentInfoRaw?: string | null // import-only; raw text only (e.g. "1/12"), never interpreted
  rawRow?: readonly string[] // import-only debug metadata — the original CSV cells for this row
}

// Reshapes today's validated row into the canonical shape. Currently a
// pure passthrough with no information loss beyond what validateImportRow
// itself already discards — exists so downstream consumers can start
// working against one stable shape regardless of whether a row came from
// manual mapping or a future profile.
export function toImportedTransaction(row: {
  txnDate: string
  description: string
  merchantName: string | null
  amountAgorot: number
}): ImportedTransaction {
  return {
    txnDate: row.txnDate,
    description: row.description,
    merchantName: row.merchantName,
    amountAgorot: row.amountAgorot,
  }
}
