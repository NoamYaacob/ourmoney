// Generic column mapping — not a hardcoded bank format. The user (or a
// future auto-detection heuristic, not built in M7) assigns each CSV column
// a role; this function is a pure reshape from "rows of cells" to "rows of
// named raw fields," with no validation of the values themselves
// (validateImportRow.ts's job).

export type CsvColumnRole = 'date' | 'description' | 'merchant' | 'amount' | 'debit' | 'credit' | 'ignore'

export type CsvColumnMapping = Record<number, CsvColumnRole>

export interface MappedCsvRow {
  rawDate: string | null
  rawDescription: string | null
  rawMerchant: string | null
  rawAmount: string | null
  rawDebit: string | null
  rawCredit: string | null
}

export function mapCsvColumns(rows: readonly string[][], mapping: CsvColumnMapping): MappedCsvRow[] {
  return rows.map((row) => {
    const mapped: MappedCsvRow = {
      rawDate: null,
      rawDescription: null,
      rawMerchant: null,
      rawAmount: null,
      rawDebit: null,
      rawCredit: null,
    }
    row.forEach((cell, index) => {
      switch (mapping[index]) {
        case 'date':
          mapped.rawDate = cell
          break
        case 'description':
          mapped.rawDescription = cell
          break
        case 'merchant':
          mapped.rawMerchant = cell
          break
        case 'amount':
          mapped.rawAmount = cell
          break
        case 'debit':
          mapped.rawDebit = cell
          break
        case 'credit':
          mapped.rawCredit = cell
          break
        case 'ignore':
        case undefined:
          break
      }
    })
    return mapped
  })
}
