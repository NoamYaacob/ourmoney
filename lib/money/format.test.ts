import { describe, expect, it } from '@jest/globals'
import { agorotFromILS, formatILS } from './format'

// Assertions check for the expected substrings rather than byte-for-byte
// string equality: he-IL currency formatting includes locale-dependent
// bidi control characters (RLM/LRM) whose exact placement is an ICU
// implementation detail, not part of this function's contract. What matters
// is: correct digits, correct decimal places, correct sign, correct
// currency symbol — never that a `-` disappears or moves to the wrong side.
describe('formatILS', () => {
  it('formats a positive integer amount with two decimals and the ILS symbol', () => {
    const result = formatILS(12999)
    expect(result).toContain('129.99')
    expect(result).toContain('₪')
    expect(result).not.toContain('-')
  })

  it('formats a negative (expense) amount with a minus sign', () => {
    const result = formatILS(-4550)
    expect(result).toContain('45.50')
    expect(result).toContain('-')
    expect(result).toContain('₪')
  })

  it('formats zero', () => {
    const result = formatILS(0)
    expect(result).toContain('0.00')
    expect(result).not.toContain('-')
  })

  it('always renders two decimal places', () => {
    expect(formatILS(100)).toContain('1.00')
  })
})

describe('agorotFromILS', () => {
  it('parses a whole-number amount', () => {
    const result = agorotFromILS('130')
    expect(result).toEqual({ ok: true, agorot: 13000, error: null })
  })

  it('parses a two-decimal amount', () => {
    const result = agorotFromILS('129.99')
    expect(result).toEqual({ ok: true, agorot: 12999, error: null })
  })

  it('parses a one-decimal amount', () => {
    const result = agorotFromILS('45.5')
    expect(result).toEqual({ ok: true, agorot: 4550, error: null })
  })

  it('trims surrounding whitespace', () => {
    const result = agorotFromILS('  50  ')
    expect(result).toEqual({ ok: true, agorot: 5000, error: null })
  })

  it('rejects zero', () => {
    expect(agorotFromILS('0').ok).toBe(false)
    expect(agorotFromILS('0').error).toBe('not_positive')
  })

  it('rejects a negative amount', () => {
    const result = agorotFromILS('-5')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid')
  })

  it('rejects non-numeric input', () => {
    const result = agorotFromILS('abc')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid')
  })

  it('rejects Infinity/NaN spellings', () => {
    expect(agorotFromILS('Infinity').ok).toBe(false)
    expect(agorotFromILS('NaN').ok).toBe(false)
  })

  it('rejects scientific notation', () => {
    expect(agorotFromILS('1e10').ok).toBe(false)
  })

  it('rejects more than two decimal places', () => {
    const result = agorotFromILS('12.999')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('too_many_decimals')
  })

  it('rejects an amount over the sane upper bound', () => {
    const result = agorotFromILS('10000001')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('too_large')
  })

  it('accepts an amount exactly at the upper bound', () => {
    const result = agorotFromILS('10000000')
    expect(result.ok).toBe(true)
  })
})
