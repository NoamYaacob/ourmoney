import { describe, expect, it } from '@jest/globals'
import { toImportedTransaction } from './importedTransaction'

describe('toImportedTransaction', () => {
  it('carries the persisted fields through unchanged', () => {
    const result = toImportedTransaction({
      txnDate: '2026-01-15',
      description: 'Coffee',
      merchantName: 'Cafe Aroma',
      amountAgorot: -2000,
    })
    expect(result).toEqual({
      txnDate: '2026-01-15',
      description: 'Coffee',
      merchantName: 'Cafe Aroma',
      amountAgorot: -2000,
    })
  })

  it('preserves a null merchantName rather than inventing a value', () => {
    const result = toImportedTransaction({
      txnDate: '2026-01-15',
      description: 'Coffee',
      merchantName: null,
      amountAgorot: -2000,
    })
    expect(result.merchantName).toBeNull()
  })

  it('leaves the import-only fields (postingDate, currency, sourceProfileId, etc.) unset', () => {
    const result = toImportedTransaction({
      txnDate: '2026-01-15',
      description: 'Coffee',
      merchantName: null,
      amountAgorot: -2000,
    })
    expect(result.postingDate).toBeUndefined()
    expect(result.currency).toBeUndefined()
    expect(result.sourceProfileId).toBeUndefined()
    expect(result.sourceReferenceId).toBeUndefined()
    expect(result.installmentInfoRaw).toBeUndefined()
    expect(result.rawRow).toBeUndefined()
  })
})
