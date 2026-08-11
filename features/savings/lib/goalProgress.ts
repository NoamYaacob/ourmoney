// Savings-goal progress reuses lib/money/arithmetic.ts's spentPercent
// verbatim — the formula (Math.floor((numerator*100)/denominator), integer
// cross-multiplication, never a float ratio) is identical for "how much of
// a budget has been spent" and "how much of a goal has been reached." This
// file exists only to give the reused function a name that reads correctly
// at savings-goal call sites — not a new implementation.

import { spentPercent } from '@/lib/money/arithmetic'

export function goalProgressPercent(currentAgorot: number, targetAgorot: number): number | null {
  return spentPercent(currentAgorot, targetAgorot)
}
