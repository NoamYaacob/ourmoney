import { describe, expect, it } from '@jest/globals'
import {
  buildLensOptions,
  DEFAULT_HOUSEHOLD_LENS,
  resolveLensAttributedUserIds,
  resolveRowEmphasis,
} from './householdLens'

const ME = { userId: 'u-noam', displayName: 'נועם לוי' }
const PARTNER = { userId: 'u-dana', displayName: 'דנה לוי' }
const THIRD = { userId: 'u-third', displayName: 'אביב לוי' }

describe('householdLens — default', () => {
  it('defaults to שלנו (shared)', () => {
    expect(DEFAULT_HOUSEHOLD_LENS).toBe('shared')
  })
})

describe('buildLensOptions', () => {
  it('offers only שלנו for a single-member household', () => {
    const options = buildLensOptions([ME], ME.userId)
    expect(options).toEqual([{ lens: 'shared', memberNames: null }])
  })

  it('offers only שלנו when there is no current user to distinguish from', () => {
    const options = buildLensOptions([ME, PARTNER], null)
    expect(options).toEqual([{ lens: 'shared', memberNames: null }])
  })

  it('offers שלנו / שלי / שלך with the real partner name for exactly two members', () => {
    const options = buildLensOptions([ME, PARTNER], ME.userId)
    expect(options.map((o) => o.lens)).toEqual(['shared', 'me', 'partner'])
    expect(options.find((o) => o.lens === 'me')?.memberNames).toEqual(['נועם לוי'])
    expect(options.find((o) => o.lens === 'partner')?.memberNames).toEqual(['דנה לוי'])
  })

  it('groups every other real member under partner for 3+ members, naming none of them arbitrarily as THE partner', () => {
    const options = buildLensOptions([ME, PARTNER, THIRD], ME.userId)
    const partner = options.find((o) => o.lens === 'partner')
    expect(partner?.memberNames).toEqual(['דנה לוי', 'אביב לוי'])
  })
})

describe('resolveLensAttributedUserIds', () => {
  it('שלנו never filters, regardless of household size', () => {
    expect(resolveLensAttributedUserIds('shared', [ME, PARTNER], ME.userId)).toBeNull()
  })

  it('שלי resolves to exactly the current user', () => {
    expect(resolveLensAttributedUserIds('me', [ME, PARTNER], ME.userId)).toEqual([ME.userId])
  })

  it('שלך resolves to the real other member for two members', () => {
    expect(resolveLensAttributedUserIds('partner', [ME, PARTNER], ME.userId)).toEqual([PARTNER.userId])
  })

  it('שלך resolves to every other real member for 3+, never a fabricated single "partner"', () => {
    expect(resolveLensAttributedUserIds('partner', [ME, PARTNER, THIRD], ME.userId)).toEqual([PARTNER.userId, THIRD.userId])
  })

  it('never filters when there is no current user', () => {
    expect(resolveLensAttributedUserIds('me', [ME, PARTNER], null)).toBeNull()
  })
})

describe('resolveRowEmphasis', () => {
  it('is always normal under שלנו (attributedUserIds null)', () => {
    expect(resolveRowEmphasis(ME.userId, null)).toBe('normal')
    expect(resolveRowEmphasis(PARTNER.userId, null)).toBe('normal')
    expect(resolveRowEmphasis(null, null)).toBe('normal')
  })

  it('is normal for a row whose real payer matches the selected lens', () => {
    expect(resolveRowEmphasis(ME.userId, [ME.userId])).toBe('normal')
  })

  it('is quiet for a row whose real payer is known and genuinely outside the selected lens', () => {
    expect(resolveRowEmphasis(PARTNER.userId, [ME.userId])).toBe('quiet')
  })

  it('never de-emphasizes an unattributed row — an unknown payer is never treated as "not yours"', () => {
    expect(resolveRowEmphasis(null, [ME.userId])).toBe('normal')
    expect(resolveRowEmphasis(undefined, [ME.userId])).toBe('normal')
  })
})
