import { describe, expect, it } from '@jest/globals'
import { intersectWithVisible, selectAllVisible, toggleSelection } from './transactionSelection'

describe('toggleSelection', () => {
  it('adds an id not already selected', () => {
    const result = toggleSelection(new Set(['a']), 'b')
    expect(result).toEqual(new Set(['a', 'b']))
  })

  it('removes an id already selected', () => {
    const result = toggleSelection(new Set(['a', 'b']), 'b')
    expect(result).toEqual(new Set(['a']))
  })

  it('does not mutate the input set', () => {
    const original = new Set(['a'])
    toggleSelection(original, 'b')
    expect(original).toEqual(new Set(['a']))
  })

  it('toggling twice returns to the original state', () => {
    const original = new Set(['a'])
    const once = toggleSelection(original, 'b')
    const twice = toggleSelection(once, 'b')
    expect(twice).toEqual(original)
  })
})

describe('selectAllVisible', () => {
  it('selects every id passed', () => {
    expect(selectAllVisible(['a', 'b', 'c'])).toEqual(new Set(['a', 'b', 'c']))
  })

  it('produces an empty set for an empty visible list', () => {
    expect(selectAllVisible([])).toEqual(new Set())
  })
})

describe('intersectWithVisible', () => {
  it('keeps only selected ids that are still in the visible list', () => {
    const result = intersectWithVisible(new Set(['a', 'b', 'c']), ['b', 'c', 'd'])
    expect(result.sort()).toEqual(['b', 'c'])
  })

  it('excludes every selected id when none are visible (stale selection)', () => {
    const result = intersectWithVisible(new Set(['x', 'y']), ['a', 'b'])
    expect(result).toEqual([])
  })

  it('returns an empty array when selection is empty', () => {
    expect(intersectWithVisible(new Set(), ['a', 'b'])).toEqual([])
  })

  it('returns every selected id when the entire selection is visible', () => {
    const result = intersectWithVisible(new Set(['a', 'b']), ['a', 'b', 'c'])
    expect(result.sort()).toEqual(['a', 'b'])
  })
})
