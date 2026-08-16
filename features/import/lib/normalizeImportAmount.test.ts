import { describe, expect, it } from '@jest/globals'
import { isZeroOrBlankImportAmount, normalizeImportAmount } from './normalizeImportAmount'

describe('normalizeImportAmount', () => {
  it('parses a plain magnitude with no separators', () => {
    expect(normalizeImportAmount('1234.56')).toEqual({ ok: true, agorot: 123456 })
  })

  it('parses a thousands-separated magnitude', () => {
    expect(normalizeImportAmount('1,234.56')).toEqual({ ok: true, agorot: 123456 })
  })

  it('parses a thousands-separated magnitude with no decimal part', () => {
    expect(normalizeImportAmount('12,345')).toEqual({ ok: true, agorot: 1234500 })
  })

  it('parses a leading-minus negative', () => {
    expect(normalizeImportAmount('-123.45')).toEqual({ ok: true, agorot: -12345 })
  })

  it('parses a parenthesized value as negative', () => {
    expect(normalizeImportAmount('(123.45)')).toEqual({ ok: true, agorot: -12345 })
  })

  it('parses a parenthesized thousands-separated value as negative', () => {
    expect(normalizeImportAmount('(1,234.56)')).toEqual({ ok: true, agorot: -123456 })
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeImportAmount('  1234.56  ')).toEqual({ ok: true, agorot: 123456 })
  })

  it('accepts an explicit leading plus', () => {
    expect(normalizeImportAmount('+123.45')).toEqual({ ok: true, agorot: 12345 })
  })

  it('rejects an improperly grouped thousands separator (not a valid 3-digit group)', () => {
    expect(normalizeImportAmount('1,2345')).toEqual({ ok: false, agorot: null })
  })

  it('rejects comma-as-decimal-separator input rather than guessing a locale', () => {
    // Ambiguous: could be "123.45" (comma-as-decimal) or a malformed
    // thousands group. Milestone A never guesses — see this file's own
    // locale-ambiguity note.
    expect(normalizeImportAmount('123,45')).toEqual({ ok: false, agorot: null })
  })

  it('rejects a blank string', () => {
    expect(normalizeImportAmount('   ')).toEqual({ ok: false, agorot: null })
  })

  it('rejects non-numeric garbage', () => {
    expect(normalizeImportAmount('abc')).toEqual({ ok: false, agorot: null })
  })

  it('rejects zero (agorotFromILS never accepts a non-positive magnitude)', () => {
    expect(normalizeImportAmount('0.00')).toEqual({ ok: false, agorot: null })
  })
})

describe('isZeroOrBlankImportAmount', () => {
  it.each([null, undefined, '', '   ', '0', '0.0', '0.00', '-0.00', '(0.00)'])(
    'treats %p as zero/blank (an empty side for debit/credit ambiguity purposes)',
    (value) => {
      expect(isZeroOrBlankImportAmount(value)).toBe(true)
    }
  )

  it.each(['150', '150.00', '-150.00', '(150.00)', '1,234.56'])(
    'treats %p as a meaningful (non-zero) amount',
    (value) => {
      expect(isZeroOrBlankImportAmount(value)).toBe(false)
    }
  )
})
