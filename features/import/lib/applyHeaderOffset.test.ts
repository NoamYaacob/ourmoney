import { describe, expect, it } from '@jest/globals'
import { applyHeaderOffset } from './applyHeaderOffset'

const TABLE = [
  ['Account Summary Export'],
  ['Generated: 2026-01-01'],
  ['date', 'description', 'amount'],
  ['01/01/2026', 'Coffee', '-20'],
  ['02/01/2026', 'Salary', '5000'],
]

describe('applyHeaderOffset', () => {
  it('defaults to treating row 0 as the header (today\'s exact behavior, offset 0)', () => {
    const result = applyHeaderOffset(TABLE, 0)
    expect(result.headers).toEqual(['Account Summary Export'])
    expect(result.rows).toEqual(TABLE.slice(1))
  })

  it('skips N introductory rows so the real header row is used', () => {
    const result = applyHeaderOffset(TABLE, 2)
    expect(result.headers).toEqual(['date', 'description', 'amount'])
    expect(result.rows).toEqual([
      ['01/01/2026', 'Coffee', '-20'],
      ['02/01/2026', 'Salary', '5000'],
    ])
  })

  it('clamps a negative offset to 0', () => {
    const result = applyHeaderOffset(TABLE, -3)
    expect(result.headers).toEqual(['Account Summary Export'])
  })

  it('clamps an offset beyond the table length to an empty result rather than throwing', () => {
    const result = applyHeaderOffset(TABLE, 999)
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
  })

  it('treats a non-finite offset as 0', () => {
    const result = applyHeaderOffset(TABLE, NaN)
    expect(result.headers).toEqual(['Account Summary Export'])
  })

  it('does not mutate the original table', () => {
    const original = TABLE.map((row) => [...row])
    applyHeaderOffset(TABLE, 2).rows[0]?.push('mutated')
    expect(TABLE).toEqual(original)
  })
})
