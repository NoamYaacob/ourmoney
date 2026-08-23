// Required-monthly-saving projection toward a goal's target date —
// deterministic, no AI (CLAUDE.md § Deterministic Financial Logic vs. AI /
// ADR-012). Takes currentAgorot/targetAgorot as already-resolved numbers —
// the caller is responsible for running them through
// resolveGoalCurrentAgorot/resolveGoalIsCompleted first (features/savings/
// lib/goalProgress.ts) so a linked_account goal's live balance, not its
// stale stored current_agorot, is what this projects from. This file adds
// no second progress source of its own.
//
// "Hide instead of inventing precision": returns null only when there is
// literally no deadline to project against — target_date is optional on a
// savings goal (a goal can exist with no target date at all), and
// "required monthly saving" is meaningless without one.
//
// isOnTrack is deliberately NOT a comparison against a historical savings
// rate — this app has no reliable time-series of "how much was saved when"
// for either progress_source (a manual goal's current_agorot is a single
// live value with no history; a linked_account goal's balance history
// would require reconstructing it from that account's transaction log,
// which is a materially different, larger feature this function does not
// invent). "On track" here means exactly what can be honestly derived
// today: the deadline has not yet passed and the remaining amount can
// still mathematically be reached by saving requiredMonthlyAgorot/month
// from now on. "Behind" means the target date has already passed and the
// goal still isn't complete — a fact, not an estimate.

export interface SavingsPaceInput {
  currentAgorot: number
  targetAgorot: number
  targetDate: string | null
  today: string
}

export interface SavingsPaceResult {
  remainingAgorot: number
  // 0 once the goal is complete or overdue — there is no "next month" to
  // spread the remainder across in either case.
  monthsRemaining: number
  requiredMonthlyAgorot: number
  isOverdue: boolean
  isOnTrack: boolean
}

// Calendar months remaining from today up to (and including) targetDate,
// counting the current partial month as one full opportunity — never the
// flat "days / 30" approximation, so this stays exact across 28-31 day
// months the same way features/budgets/lib/budgetPeriod.ts's shiftMonth
// does for calendar-month arithmetic elsewhere in this app.
function calendarMonthsRemaining(todayIso: string, targetIso: string): number {
  const [ty, tm, td] = todayIso.split('-').map(Number) as [number, number, number]
  const [gy, gm, gd] = targetIso.split('-').map(Number) as [number, number, number]
  let months = (gy - ty) * 12 + (gm - tm)
  if (gd < td) months -= 1
  return Math.max(1, months)
}

export function calculateSavingsPace(input: SavingsPaceInput): SavingsPaceResult | null {
  if (!input.targetDate) return null

  const remainingAgorot = Math.max(0, input.targetAgorot - input.currentAgorot)
  if (remainingAgorot === 0) {
    return { remainingAgorot: 0, monthsRemaining: 0, requiredMonthlyAgorot: 0, isOverdue: false, isOnTrack: true }
  }

  const isOverdue = input.today > input.targetDate
  if (isOverdue) {
    return { remainingAgorot, monthsRemaining: 0, requiredMonthlyAgorot: remainingAgorot, isOverdue: true, isOnTrack: false }
  }

  const monthsRemaining = calendarMonthsRemaining(input.today, input.targetDate)
  // Ceil, never floor/round — undershooting the required monthly figure
  // would silently make the goal mathematically unreachable by the
  // deadline even if every suggested payment is made exactly.
  const requiredMonthlyAgorot = Math.ceil(remainingAgorot / monthsRemaining)

  return { remainingAgorot, monthsRemaining, requiredMonthlyAgorot, isOverdue: false, isOnTrack: true }
}
