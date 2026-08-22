import { describe, expect, it } from '@jest/globals'
import { goalProgressPercent, resolveGoalCurrentAgorot, resolveGoalIsCompleted } from './goalProgress'

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

describe('resolveGoalCurrentAgorot', () => {
  it('returns the stored current_agorot for a manual goal, ignoring any account balance', () => {
    const goal = { progress_source: 'manual' as const, account_id: 'acc-1', current_agorot: 50_000 }
    expect(resolveGoalCurrentAgorot(goal, { 'acc-1': 999_999 })).toBe(50_000)
  })

  it('returns the linked account live balance for a linked_account goal, ignoring stored current_agorot', () => {
    const goal = { progress_source: 'linked_account' as const, account_id: 'acc-1', current_agorot: 0 }
    expect(resolveGoalCurrentAgorot(goal, { 'acc-1': 75_000 })).toBe(75_000)
  })

  it('defaults to 0 for a linked_account goal with no balance-map entry yet', () => {
    const goal = { progress_source: 'linked_account' as const, account_id: 'acc-1', current_agorot: 0 }
    expect(resolveGoalCurrentAgorot(goal, {})).toBe(0)
  })

  it('falls back to stored current_agorot if linked_account has no account_id (should not happen, but no crash)', () => {
    const goal = { progress_source: 'linked_account' as const, account_id: null, current_agorot: 12_000 }
    expect(resolveGoalCurrentAgorot(goal, {})).toBe(12_000)
  })
})

describe('resolveGoalIsCompleted', () => {
  it('uses the stored is_completed for a manual goal', () => {
    const goal = {
      progress_source: 'manual' as const,
      account_id: null,
      current_agorot: 0,
      target_agorot: 100_000,
      is_completed: true,
    }
    expect(resolveGoalIsCompleted(goal, {})).toBe(true)
  })

  it('derives completion from the live linked balance, ignoring a stale stored is_completed', () => {
    const goal = {
      progress_source: 'linked_account' as const,
      account_id: 'acc-1',
      current_agorot: 0,
      target_agorot: 100_000,
      is_completed: false,
    }
    expect(resolveGoalIsCompleted(goal, { 'acc-1': 100_000 })).toBe(true)
    expect(resolveGoalIsCompleted(goal, { 'acc-1': 99_999 })).toBe(false)
  })
})
