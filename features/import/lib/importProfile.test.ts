// Proves the profile seam itself works end to end using a fake, test-only
// profile — NOT a real Israeli institution (none are implemented in
// Milestone A; see IMPORT_PROFILES's own comment). This is what "the
// architecture must allow a future profile to plug in" means made concrete:
// a profile object satisfying ImportProfile can detect its own headers and
// produce a MappedCsvRow, without registering it in the real registry.

import { describe, expect, it } from '@jest/globals'
import { detectImportProfile, IMPORT_PROFILES, type ImportProfile } from './importProfile'

const FAKE_TEST_PROFILE: ImportProfile = {
  id: 'fake-test-profile',
  displayName: 'Fake Test Bank',
  detect: (headers) => headers.length === 3 && headers[0] === 'TEST_DATE',
  mapRow: (row) => ({
    rawDate: row[0] ?? null,
    rawDescription: row[1] ?? null,
    rawMerchant: null,
    rawAmount: row[2] ?? null,
    rawDebit: null,
    rawCredit: null,
  }),
}

describe('IMPORT_PROFILES', () => {
  it('is empty in Milestone A — no real institution profile is implemented yet', () => {
    expect(IMPORT_PROFILES).toEqual([])
  })
})

describe('detectImportProfile', () => {
  it('returns null when the registry is empty (current Milestone A state)', () => {
    expect(detectImportProfile(['date', 'description', 'amount'])).toBeNull()
  })

  it('finds a profile whose detect() recognizes the header shape (seam correctness, using a fake profile)', () => {
    const registry = [FAKE_TEST_PROFILE]
    const found = registry.find((p) => p.detect(['TEST_DATE', 'desc', 'amt']))
    expect(found).toBe(FAKE_TEST_PROFILE)
  })

  it('a matched profile maps a raw row to the same MappedCsvRow shape manual mapping produces', () => {
    const mapped = FAKE_TEST_PROFILE.mapRow(['01/01/2026', 'Coffee', '-20'], ['TEST_DATE', 'desc', 'amt'])
    expect(mapped).toEqual({
      rawDate: '01/01/2026',
      rawDescription: 'Coffee',
      rawMerchant: null,
      rawAmount: '-20',
      rawDebit: null,
      rawCredit: null,
    })
  })

  it('does not detect a header shape it was not built for', () => {
    expect(FAKE_TEST_PROFILE.detect(['date', 'description', 'amount'])).toBe(false)
  })
})
