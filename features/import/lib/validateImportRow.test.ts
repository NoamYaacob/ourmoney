import { describe, expect, it } from '@jest/globals'
import { validateImportRow } from './validateImportRow'
import type { MappedCsvRow } from './mapCsvColumns'

function row(overrides: Partial<MappedCsvRow>): MappedCsvRow {
  return {
    rawDate: null,
    rawDescription: null,
    rawMerchant: null,
    rawAmount: null,
    rawDebit: null,
    rawCredit: null,
    ...overrides,
  }
}

describe('validateImportRow', () => {
  it('accepts a valid ISO date (YYYY-MM-DD)', () => {
    const result = validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawAmount: '-100' }))
    expect(result).toEqual({ valid: true, row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: -10000 } })
  })

  it('accepts a valid DD/MM/YYYY date (Israeli bank export convention)', () => {
    const result = validateImportRow(row({ rawDate: '15/01/2026', rawDescription: 'Test', rawAmount: '-100' }))
    expect(result).toEqual({ valid: true, row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: -10000 } })
  })

  it('rejects an unparseable date', () => {
    expect(validateImportRow(row({ rawDate: 'not-a-date', rawDescription: 'Test', rawAmount: '-100' }))).toEqual({
      valid: false,
      reason: 'invalid_date',
    })
  })

  it('rejects a calendar-invalid date (Feb 30)', () => {
    expect(validateImportRow(row({ rawDate: '30/02/2026', rawDescription: 'Test', rawAmount: '-100' }))).toEqual({
      valid: false,
      reason: 'invalid_date',
    })
  })

  it('rejects a missing/blank description', () => {
    expect(validateImportRow(row({ rawDate: '2026-01-15', rawDescription: '   ', rawAmount: '-100' }))).toEqual({
      valid: false,
      reason: 'missing_description',
    })
  })

  it('resolves a positive debit column as a negative (expense) amount', () => {
    const result = validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawDebit: '250' }))
    expect(result).toEqual({ valid: true, row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: -25000 } })
  })

  it('resolves a positive credit column as a positive (income) amount', () => {
    const result = validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawCredit: '250' }))
    expect(result).toEqual({ valid: true, row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: 25000 } })
  })

  it('rejects a row with both debit and credit populated (ambiguous)', () => {
    const result = validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawDebit: '100', rawCredit: '50' }))
    expect(result).toEqual({ valid: false, reason: 'invalid_amount' })
  })

  it('rejects a row with no amount data at all', () => {
    expect(validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test' }))).toEqual({
      valid: false,
      reason: 'missing_amount',
    })
  })

  it('rejects a malformed amount (too many decimal places)', () => {
    expect(validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawAmount: '100.999' }))).toEqual({
      valid: false,
      reason: 'invalid_amount',
    })
  })

  it('rejects a non-numeric amount', () => {
    expect(validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawAmount: 'abc' }))).toEqual({
      valid: false,
      reason: 'invalid_amount',
    })
  })

  it('rejects a zero amount (D6: never a legitimate movement of money)', () => {
    expect(validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawAmount: '0' }))).toEqual({
      valid: false,
      reason: 'invalid_amount',
    })
  })

  it('parses a thousands-separated amount (Milestone A)', () => {
    const result = validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawAmount: '1,234.56' }))
    expect(result).toEqual({
      valid: true,
      row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: 123456 },
    })
  })

  it('parses a parenthesized amount as negative (Milestone A)', () => {
    const result = validateImportRow(row({ rawDate: '2026-01-15', rawDescription: 'Test', rawAmount: '(123.45)' }))
    expect(result).toEqual({
      valid: true,
      row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: -12345 },
    })
  })

  it('treats a zero-filled credit column as absent, resolving the row from a real debit value (Milestone A)', () => {
    const result = validateImportRow(
      row({ rawDate: '2026-01-15', rawDescription: 'Test', rawDebit: '100', rawCredit: '0.00' })
    )
    expect(result).toEqual({
      valid: true,
      row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: -10000 },
    })
  })

  it('treats a zero-filled debit column as absent, resolving the row from a real credit value (Milestone A)', () => {
    const result = validateImportRow(
      row({ rawDate: '2026-01-15', rawDescription: 'Test', rawDebit: '0', rawCredit: '50' })
    )
    expect(result).toEqual({
      valid: true,
      row: { txnDate: '2026-01-15', description: 'Test', merchantName: null, amountAgorot: 5000 },
    })
  })

  it('still rejects as ambiguous when both debit and credit hold real non-zero values (Milestone A regression)', () => {
    const result = validateImportRow(
      row({ rawDate: '2026-01-15', rawDescription: 'Test', rawDebit: '100', rawCredit: '50' })
    )
    expect(result).toEqual({ valid: false, reason: 'invalid_amount' })
  })

  it('resolves missing_amount when both debit and credit are zero-filled (Milestone A)', () => {
    const result = validateImportRow(
      row({ rawDate: '2026-01-15', rawDescription: 'Test', rawDebit: '0.00', rawCredit: '0.00' })
    )
    expect(result).toEqual({ valid: false, reason: 'missing_amount' })
  })

  it('carries the merchant column through as merchantName when mapped', () => {
    const result = validateImportRow(
      row({ rawDate: '2026-01-15', rawDescription: 'Test', rawMerchant: 'Cafe Aroma', rawAmount: '-20' })
    )
    expect(result).toEqual({
      valid: true,
      row: { txnDate: '2026-01-15', description: 'Test', merchantName: 'Cafe Aroma', amountAgorot: -2000 },
    })
  })

  it('resolves merchantName to null when the merchant column is blank or unmapped', () => {
    const result = validateImportRow(
      row({ rawDate: '2026-01-15', rawDescription: 'Test', rawMerchant: '   ', rawAmount: '-20' })
    )
    expect(result.valid).toBe(true)
    expect(result.valid && result.row.merchantName).toBeNull()
  })
})
