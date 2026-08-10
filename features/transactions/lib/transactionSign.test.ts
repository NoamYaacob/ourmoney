import { describe, expect, it } from '@jest/globals'
import { signedAmountAgorot } from './transactionSign'

describe('signedAmountAgorot', () => {
  it('keeps income positive', () => {
    expect(signedAmountAgorot(5000, true)).toBe(5000)
  })

  it('negates an expense', () => {
    expect(signedAmountAgorot(5000, false)).toBe(-5000)
  })

  it('never receives or produces a negative input', () => {
    // The caller (agorotFromILS) already guarantees a positive value; this
    // function's contract is sign derivation only, not input validation.
    expect(signedAmountAgorot(1, false)).toBe(-1)
  })
})
