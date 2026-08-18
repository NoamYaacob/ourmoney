import { describe, expect, it } from '@jest/globals'
import { planCopyPreviousMonthBudget } from './copyPreviousMonthBudget'

describe('planCopyPreviousMonthBudget', () => {
  it('copies everything when the target month is empty and all categories are valid', () => {
    const previous = [
      { categoryId: 'cat-food', amountAgorot: 150000 },
      { categoryId: 'cat-transport', amountAgorot: 50000 },
    ]
    const plan = planCopyPreviousMonthBudget(previous, [], new Set(['cat-food', 'cat-transport']))

    expect(plan.toCopy).toEqual(previous)
    expect(plan.alreadyExistingCount).toBe(0)
    expect(plan.skippedDeletedCount).toBe(0)
  })

  it('preserves existing target allocations and only copies the missing categories', () => {
    const previous = [
      { categoryId: 'cat-food', amountAgorot: 150000 },
      { categoryId: 'cat-transport', amountAgorot: 50000 },
    ]
    const target = [{ categoryId: 'cat-food', amountAgorot: 99999 }]
    const plan = planCopyPreviousMonthBudget(previous, target, new Set(['cat-food', 'cat-transport']))

    expect(plan.toCopy).toEqual([{ categoryId: 'cat-transport', amountAgorot: 50000 }])
    expect(plan.alreadyExistingCount).toBe(1)
    expect(plan.skippedDeletedCount).toBe(0)
  })

  it('is a no-op when every previous-month category already exists in the target month', () => {
    const previous = [{ categoryId: 'cat-food', amountAgorot: 150000 }]
    const target = [{ categoryId: 'cat-food', amountAgorot: 99999 }]
    const plan = planCopyPreviousMonthBudget(previous, target, new Set(['cat-food']))

    expect(plan.toCopy).toEqual([])
    expect(plan.alreadyExistingCount).toBe(1)
    expect(plan.skippedDeletedCount).toBe(0)
  })

  it('skips categories that are no longer valid/available and reports the count', () => {
    const previous = [
      { categoryId: 'cat-food', amountAgorot: 150000 },
      { categoryId: 'cat-deleted', amountAgorot: 20000 },
    ]
    const plan = planCopyPreviousMonthBudget(previous, [], new Set(['cat-food']))

    expect(plan.toCopy).toEqual([{ categoryId: 'cat-food', amountAgorot: 150000 }])
    expect(plan.skippedDeletedCount).toBe(1)
    expect(plan.alreadyExistingCount).toBe(0)
  })

  it('returns an empty plan when there is no previous-month budget', () => {
    const plan = planCopyPreviousMonthBudget([], [], new Set(['cat-food']))

    expect(plan.toCopy).toEqual([])
    expect(plan.alreadyExistingCount).toBe(0)
    expect(plan.skippedDeletedCount).toBe(0)
  })

  it('returns an empty plan when the previous month exists but has zero allocations', () => {
    const plan = planCopyPreviousMonthBudget([], [{ categoryId: 'cat-food', amountAgorot: 500 }], new Set(['cat-food']))

    expect(plan.toCopy).toEqual([])
    expect(plan.alreadyExistingCount).toBe(0)
    expect(plan.skippedDeletedCount).toBe(0)
  })

  it('preserves exact agorot amounts without any rounding or float conversion', () => {
    const previous = [{ categoryId: 'cat-food', amountAgorot: 123457 }]
    const plan = planCopyPreviousMonthBudget(previous, [], new Set(['cat-food']))

    expect(plan.toCopy[0]?.amountAgorot).toBe(123457)
  })

  it('handles a mix of already-existing, skipped-deleted, and to-copy categories together', () => {
    const previous = [
      { categoryId: 'cat-food', amountAgorot: 150000 },
      { categoryId: 'cat-transport', amountAgorot: 50000 },
      { categoryId: 'cat-deleted', amountAgorot: 20000 },
    ]
    const target = [{ categoryId: 'cat-food', amountAgorot: 99999 }]
    const plan = planCopyPreviousMonthBudget(previous, target, new Set(['cat-food', 'cat-transport']))

    expect(plan.toCopy).toEqual([{ categoryId: 'cat-transport', amountAgorot: 50000 }])
    expect(plan.alreadyExistingCount).toBe(1)
    expect(plan.skippedDeletedCount).toBe(1)
  })
})
