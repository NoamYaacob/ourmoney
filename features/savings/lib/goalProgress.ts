// Savings-goal progress reuses lib/money/arithmetic.ts's spentPercent
// verbatim — the formula (Math.floor((numerator*100)/denominator), integer
// cross-multiplication, never a float ratio) is identical for "how much of
// a budget has been spent" and "how much of a goal has been reached." This
// file exists only to give the reused function a name that reads correctly
// at savings-goal call sites — not a new implementation.

import { spentPercent } from '@/lib/money/arithmetic'
import type { SavingsGoal } from '@/types/app'

export function goalProgressPercent(currentAgorot: number, targetAgorot: number): number | null {
  return spentPercent(currentAgorot, targetAgorot)
}

// A 'linked_account' goal's stored current_agorot/is_completed columns are
// NOT the display source of truth — migration 015 deliberately leaves them
// unwritten by update_savings_goal_progress once linked (that RPC now
// rejects a manual write on a linked goal), so the only live figure is the
// linked account's own balance. This mirrors lib/engines/cashflow's
// "compute live, never persist" precedent for Safe-to-Spend rather than
// introducing a second stored-balance write path for the same account.
//
// accountBalances is features/accounts/hooks/useAccountBalances.ts's own
// output shape (missing key defaults to 0, same convention as
// eligibleCashAccounts.ts documents).
export function resolveGoalCurrentAgorot(
  goal: Pick<SavingsGoal, 'progress_source' | 'account_id' | 'current_agorot'>,
  accountBalances: Readonly<Record<string, number>>
): number {
  if (goal.progress_source === 'linked_account' && goal.account_id) {
    return accountBalances[goal.account_id] ?? 0
  }
  return goal.current_agorot
}

export function resolveGoalIsCompleted(
  goal: Pick<SavingsGoal, 'progress_source' | 'account_id' | 'current_agorot' | 'target_agorot' | 'is_completed'>,
  accountBalances: Readonly<Record<string, number>>
): boolean {
  if (goal.progress_source === 'linked_account') {
    return resolveGoalCurrentAgorot(goal, accountBalances) >= goal.target_agorot
  }
  return goal.is_completed
}
