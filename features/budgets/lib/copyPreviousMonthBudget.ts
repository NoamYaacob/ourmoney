export interface CategoryAllocation {
  categoryId: string
  amountAgorot: number
}

export interface CopyPreviousMonthBudgetPlan {
  toCopy: CategoryAllocation[]
  alreadyExistingCount: number
  skippedDeletedCount: number
}

export function planCopyPreviousMonthBudget(
  previousAllocations: readonly CategoryAllocation[],
  targetAllocations: readonly CategoryAllocation[],
  validCategoryIds: ReadonlySet<string>
): CopyPreviousMonthBudgetPlan {
  const targetCategoryIds = new Set(targetAllocations.map((a) => a.categoryId))
  const toCopy: CategoryAllocation[] = []
  let alreadyExistingCount = 0
  let skippedDeletedCount = 0

  for (const allocation of previousAllocations) {
    if (!validCategoryIds.has(allocation.categoryId)) {
      skippedDeletedCount += 1
      continue
    }
    if (targetCategoryIds.has(allocation.categoryId)) {
      alreadyExistingCount += 1
      continue
    }
    toCopy.push(allocation)
  }

  return { toCopy, alreadyExistingCount, skippedDeletedCount }
}
