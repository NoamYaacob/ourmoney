import { describe, expect, it } from '@jest/globals'
import { parseCsv } from './parseCsv'

describe('parseCsv', () => {
  it('splits headers from rows', () => {
    const result = parseCsv('date,description,amount\n01/01/2026,Test,100')
    expect(result.headers).toEqual(['date', 'description', 'amount'])
    expect(result.rows).toEqual([['01/01/2026', 'Test', '100']])
  })

  it('handles quoted fields containing commas', () => {
    const result = parseCsv('date,description,amount\n01/01/2026,"Test, with comma",100')
    expect(result.rows).toEqual([['01/01/2026', 'Test, with comma', '100']])
  })

  it('handles embedded newlines inside quoted fields', () => {
    const result = parseCsv('date,description,amount\n01/01/2026,"Line1\nLine2",100')
    expect(result.rows).toEqual([['01/01/2026', 'Line1\nLine2', '100']])
  })

  it('handles CRLF line endings', () => {
    const result = parseCsv('date,description,amount\r\n01/01/2026,Test,100\r\n02/01/2026,Test2,200')
    expect(result.rows).toEqual([
      ['01/01/2026', 'Test', '100'],
      ['02/01/2026', 'Test2', '200'],
    ])
  })

  it('skips blank lines', () => {
    const result = parseCsv('date,description,amount\n01/01/2026,Test,100\n\n02/01/2026,Test2,200')
    expect(result.rows).toHaveLength(2)
  })

  it('returns empty headers/rows for an empty string', () => {
    const result = parseCsv('')
    expect(result.headers).toEqual([])
    expect(result.rows).toEqual([])
  })

  // Milestone A: explicit regression pin for comma-delimited input, not
  // just implicit coverage from the tests above — see the semicolon test
  // below for why this is called out separately.
  it('parses a comma-delimited CSV', () => {
    const result = parseCsv('date,description,amount\n01/01/2026,Test,100')
    expect(result.headers).toEqual(['date', 'description', 'amount'])
    expect(result.rows).toEqual([['01/01/2026', 'Test', '100']])
  })

  // Milestone A: PapaParse auto-detects the delimiter with no explicit
  // `delimiter` option passed (parseCsv.ts never sets one) — semicolon is
  // the other delimiter real Israeli bank/card exports commonly use. This
  // was previously relied on without any test proving it, per the CSV
  // import architecture audit.
  it('auto-detects and parses a semicolon-delimited CSV', () => {
    const result = parseCsv('date;description;amount\n01/01/2026;Test;100')
    expect(result.headers).toEqual(['date', 'description', 'amount'])
    expect(result.rows).toEqual([['01/01/2026', 'Test', '100']])
  })

  it('handles quoted fields containing the delimiter in a semicolon-delimited file', () => {
    const result = parseCsv('date;description;amount\n01/01/2026;"Test; with semicolon";100')
    expect(result.rows).toEqual([['01/01/2026', 'Test; with semicolon', '100']])
  })
})
