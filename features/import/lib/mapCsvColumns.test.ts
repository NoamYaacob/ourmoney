import { describe, expect, it } from '@jest/globals'
import { mapCsvColumns } from './mapCsvColumns'

describe('mapCsvColumns', () => {
  it('maps each column to its assigned role by position', () => {
    const result = mapCsvColumns(
      [['01/01/2026', 'Coffee', 'Cafe Aroma', '-20']],
      { 0: 'date', 1: 'description', 2: 'merchant', 3: 'amount' }
    )
    expect(result).toEqual([
      { rawDate: '01/01/2026', rawDescription: 'Coffee', rawMerchant: 'Cafe Aroma', rawAmount: '-20', rawDebit: null, rawCredit: null },
    ])
  })

  it('leaves unmapped columns (role "ignore" or absent from the mapping) out of the result', () => {
    const result = mapCsvColumns([['01/01/2026', 'unused', 'Coffee', '-20']], {
      0: 'date',
      1: 'ignore',
      2: 'description',
      3: 'amount',
      // column 4 doesn't exist in this row; nothing to assert about it
    })
    expect(result).toEqual([
      { rawDate: '01/01/2026', rawDescription: 'Coffee', rawMerchant: null, rawAmount: '-20', rawDebit: null, rawCredit: null },
    ])
  })

  it('maps debit and credit columns independently of amount/merchant', () => {
    const result = mapCsvColumns([['01/01/2026', 'Coffee', '20', '']], {
      0: 'date',
      1: 'description',
      2: 'debit',
      3: 'credit',
    })
    expect(result).toEqual([
      { rawDate: '01/01/2026', rawDescription: 'Coffee', rawMerchant: null, rawAmount: null, rawDebit: '20', rawCredit: '' },
    ])
  })

  it('produces an all-null row when every column is unmapped', () => {
    const result = mapCsvColumns([['a', 'b', 'c']], {})
    expect(result).toEqual([
      { rawDate: null, rawDescription: null, rawMerchant: null, rawAmount: null, rawDebit: null, rawCredit: null },
    ])
  })

  it('maps every row independently', () => {
    const result = mapCsvColumns(
      [
        ['01/01/2026', 'Coffee', '-20'],
        ['02/01/2026', 'Salary', '5000'],
      ],
      { 0: 'date', 1: 'description', 2: 'amount' }
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.rawDescription).toBe('Coffee')
    expect(result[1]?.rawDescription).toBe('Salary')
  })
})
