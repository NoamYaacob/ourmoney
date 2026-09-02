import { describe, expect, it } from '@jest/globals'
import { resolveLabelCollisions, type LabelCollisionCandidate } from './resolveLabelCollisions'

describe('resolveLabelCollisions', () => {
  it('shows every label when candidates are spaced well apart', () => {
    const candidates: LabelCollisionCandidate[] = [
      { id: 'a', x: 0, priority: 'routine' },
      { id: 'b', x: 200, priority: 'routine' },
      { id: 'c', x: 400, priority: 'routine' },
    ]
    const shown = resolveLabelCollisions(candidates, 76)
    expect(shown).toEqual(new Set(['a', 'b', 'c']))
  })

  it('prefers the higher-priority candidate when two labels would overlap', () => {
    const candidates: LabelCollisionCandidate[] = [
      { id: 'routine-neighbor', x: 100, priority: 'routine' },
      { id: 'critical-event', x: 130, priority: 'critical' },
    ]
    const shown = resolveLabelCollisions(candidates, 76)
    expect(shown.has('critical-event')).toBe(true)
    expect(shown.has('routine-neighbor')).toBe(false)
  })

  it('a critical candidate never loses to a high or routine neighbor, regardless of input order', () => {
    const forward: LabelCollisionCandidate[] = [
      { id: 'critical', x: 500, priority: 'critical' },
      { id: 'high', x: 520, priority: 'high' },
      { id: 'routine', x: 540, priority: 'routine' },
    ]
    const reversed = [...forward].reverse()

    const shownForward = resolveLabelCollisions(forward, 76)
    const shownReversed = resolveLabelCollisions(reversed, 76)

    expect(shownForward).toEqual(new Set(['critical']))
    expect(shownReversed).toEqual(new Set(['critical']))
  })

  it('is order-independent: the same candidate set produces the same result in any input order', () => {
    const base: LabelCollisionCandidate[] = [
      { id: 'a', x: 10, priority: 'high' },
      { id: 'b', x: 40, priority: 'routine' },
      { id: 'c', x: 90, priority: 'critical' },
      { id: 'd', x: 95, priority: 'high' },
      { id: 'e', x: 300, priority: 'routine' },
    ]
    const shuffled = [base[4]!, base[1]!, base[3]!, base[0]!, base[2]!]

    expect(resolveLabelCollisions(base, 76)).toEqual(resolveLabelCollisions(shuffled, 76))
  })

  it('guarantees no two SHOWN labels sit closer than the slot width, for dense stress-style data', () => {
    // 40 candidates tightly packed across a 600px chart — the exact
    // "real overlap in stress state" scenario the CP8B brief names.
    // Deterministic pseudo-data, not a random generator (no flaky test).
    const priorities: ('critical' | 'high' | 'routine')[] = ['routine', 'high', 'routine', 'routine', 'critical']
    const candidates: LabelCollisionCandidate[] = Array.from({ length: 40 }, (_, i) => ({
      id: `event-${i}`,
      x: i * 15, // 15px apart — far tighter than any real label footprint
      priority: priorities[i % priorities.length] as 'critical' | 'high' | 'routine',
    }))

    const shown = resolveLabelCollisions(candidates, 76)
    const shownXs = candidates.filter((c) => shown.has(c.id)).map((c) => c.x).sort((a, b) => a - b)

    expect(shownXs.length).toBeGreaterThan(0)
    for (let i = 1; i < shownXs.length; i++) {
      expect(shownXs[i]! - shownXs[i - 1]!).toBeGreaterThanOrEqual(76)
    }
  })

  it('every critical candidate keeps its label even under dense stress data, as long as critical candidates themselves are not overlapping each other', () => {
    const candidates: LabelCollisionCandidate[] = [
      { id: 'c1', x: 0, priority: 'critical' },
      { id: 'c2', x: 200, priority: 'critical' },
      { id: 'c3', x: 400, priority: 'critical' },
      // A dense scatter of lower-priority noise around each critical point.
      ...Array.from({ length: 15 }, (_, i) => ({ id: `noise-${i}`, x: i * 27, priority: 'routine' as const })),
    ]
    const shown = resolveLabelCollisions(candidates, 76)
    expect(shown.has('c1')).toBe(true)
    expect(shown.has('c2')).toBe(true)
    expect(shown.has('c3')).toBe(true)
  })

  it('is a pure, deterministic function: identical input always produces an identical result', () => {
    const candidates: LabelCollisionCandidate[] = Array.from({ length: 25 }, (_, i) => ({
      id: `e${i}`,
      x: (i * 37) % 500,
      priority: (['critical', 'high', 'routine'] as const)[i % 3] as 'critical' | 'high' | 'routine',
    }))
    const first = resolveLabelCollisions(candidates, 76)
    const second = resolveLabelCollisions(candidates, 76)
    expect(first).toEqual(second)
  })

  it('honors a caller-supplied slot width (e.g. a calmer tablet density)', () => {
    const candidates: LabelCollisionCandidate[] = [
      { id: 'a', x: 0, priority: 'routine' },
      { id: 'b', x: 100, priority: 'routine' },
    ]
    // 100px apart: shown at the default 76px slot width...
    expect(resolveLabelCollisions(candidates, 76)).toEqual(new Set(['a', 'b']))
    // ...but collides at a wider, calmer 120px slot width.
    const wide = resolveLabelCollisions(candidates, 120)
    expect(wide.size).toBe(1)
  })
})
