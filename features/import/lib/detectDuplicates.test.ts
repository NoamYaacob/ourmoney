import { describe, expect, it } from '@jest/globals'
import { isDuplicateCandidate, normalizeDescriptionForDedup } from './detectDuplicates'
import type { ExistingTransactionForDedup } from './detectDuplicates'
import type { ValidImportRow } from './validateImportRow'

const EXISTING: ExistingTransactionForDedup[] = [
  { accountId: 'acc-1', txnDate: '2026-01-15', amountAgorot: -10000, description: 'קניות בסופר' },
]

describe('normalizeDescriptionForDedup', () => {
  it('trims surrounding whitespace and collapses repeated internal whitespace', () => {
    expect(normalizeDescriptionForDedup('  קניות   בסופר  ')).toBe('קניות בסופר')
  })

  it('leaves an already-normalized string unchanged', () => {
    expect(normalizeDescriptionForDedup('קניות בסופר')).toBe('קניות בסופר')
  })
})

describe('isDuplicateCandidate', () => {
  it('flags an exact match on account+date+amount+description', () => {
    const candidate: ValidImportRow = { txnDate: '2026-01-15', description: 'קניות בסופר', amountAgorot: -10000 }
    expect(isDuplicateCandidate(candidate, 'acc-1', EXISTING)).toBe(true)
  })

  it('flags a match after conservative whitespace normalization only', () => {
    const candidate: ValidImportRow = { txnDate: '2026-01-15', description: '  קניות   בסופר  ', amountAgorot: -10000 }
    expect(isDuplicateCandidate(candidate, 'acc-1', EXISTING)).toBe(true)
  })

  it('does not flag when the amount differs by even one agora', () => {
    const candidate: ValidImportRow = { txnDate: '2026-01-15', description: 'קניות בסופר', amountAgorot: -10001 }
    expect(isDuplicateCandidate(candidate, 'acc-1', EXISTING)).toBe(false)
  })

  it('does not flag when the date differs', () => {
    const candidate: ValidImportRow = { txnDate: '2026-01-16', description: 'קניות בסופר', amountAgorot: -10000 }
    expect(isDuplicateCandidate(candidate, 'acc-1', EXISTING)).toBe(false)
  })

  it('does not flag when the account differs', () => {
    const candidate: ValidImportRow = { txnDate: '2026-01-15', description: 'קניות בסופר', amountAgorot: -10000 }
    expect(isDuplicateCandidate(candidate, 'acc-2', EXISTING)).toBe(false)
  })

  it('does not flag a near-miss description (no fuzzy matching in M7)', () => {
    const candidate: ValidImportRow = { txnDate: '2026-01-15', description: 'קניות בסופר שופרסל', amountAgorot: -10000 }
    expect(isDuplicateCandidate(candidate, 'acc-1', EXISTING)).toBe(false)
  })

  it('flags every row when re-importing the identical file', () => {
    const candidates: ValidImportRow[] = [
      { txnDate: '2026-01-15', description: 'קניות בסופר', amountAgorot: -10000 },
    ]
    const flags = candidates.map((c) => isDuplicateCandidate(c, 'acc-1', EXISTING))
    expect(flags).toEqual([true])
  })
})
