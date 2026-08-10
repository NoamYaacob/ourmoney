// Pure function: given a category's spent total before and after a new
// transaction, and its allocation, decide whether this specific transaction
// is what crossed the 90% ("reached") or 100% ("exceeded") line. Fixed
// thresholds, not user-configurable — FEATURES.md marks configurable
// percent as [NEXT]. Fires only on the specific crossing (already-over
// before this transaction => neither fires again), which is the mechanism
// that prevents re-notifying on every subsequent transaction once a
// category is already over budget (single-actor case; the concurrent-
// partner race is D5's accepted, documented residual — see
// budgetThresholdSubscriber.ts).

import { hasReachedThresholdPercent } from '@/lib/money/arithmetic'

export const THRESHOLD_REACHED_PERCENT = 90
export const THRESHOLD_EXCEEDED_PERCENT = 100

export interface ThresholdCrossingResult {
  crossedThreshold: boolean
  crossedExceeded: boolean
}

export function checkThresholdCrossing(
  spentBeforeAgorot: number,
  spentAfterAgorot: number,
  allocatedAgorot: number
): ThresholdCrossingResult {
  if (allocatedAgorot <= 0) {
    return { crossedThreshold: false, crossedExceeded: false }
  }

  const wasAtThreshold = hasReachedThresholdPercent(spentBeforeAgorot, allocatedAgorot, THRESHOLD_REACHED_PERCENT)
  const isAtThreshold = hasReachedThresholdPercent(spentAfterAgorot, allocatedAgorot, THRESHOLD_REACHED_PERCENT)
  const wasExceeded = hasReachedThresholdPercent(spentBeforeAgorot, allocatedAgorot, THRESHOLD_EXCEEDED_PERCENT)
  const isExceeded = hasReachedThresholdPercent(spentAfterAgorot, allocatedAgorot, THRESHOLD_EXCEEDED_PERCENT)

  return {
    crossedThreshold: !wasAtThreshold && isAtThreshold,
    crossedExceeded: !wasExceeded && isExceeded,
  }
}
