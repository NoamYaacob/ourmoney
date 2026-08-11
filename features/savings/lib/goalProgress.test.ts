import { describe, expect, it } from '@jest/globals'
import { goalProgressPercent } from './goalProgress'

describe('goalProgressPercent', () => {
  it('returns 0 for a fresh goal with no progress', () => {
    expect(goalProgressPercent(0, 100_000)).toBe(0)
  })

  it('returns 100 exactly at target', () => {
    expect(goalProgressPercent(100_000, 100_000)).toBe(100)
  })

  it('returns over 100 when overfunded', () => {
    expect(goalProgressPercent(150_000, 100_000)).toBe(150)
  })

  it('floors instead of rounding (integer division, no float ratio)', () => {
    // 33_333 / 100_000 = 33.333% — must floor to 33, never round to 33.33 or 34.
    expect(goalProgressPercent(33_333, 100_000)).toBe(33)
  })

  it('returns null for a zero or negative target (guarded, not a crash)', () => {
    expect(goalProgressPercent(0, 0)).toBeNull()
    expect(goalProgressPercent(100, -1)).toBeNull()
  })
})
