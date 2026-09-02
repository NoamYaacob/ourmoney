// RRR P1 finding #5: DesktopDashboard.tsx hardcoded a `/ 30` divisor for
// "safe to spend per day" regardless of the selected horizon or real days
// remaining, while MobileHome.tsx correctly derived the real day count —
// same household, same instant, ~30× different advice (כ-566.20 ₪ ליום vs
// 16,986.00 ₪ ליום, live-measured in the Release Readiness Review). This is
// the single shared calculation both screens now call, so there is exactly
// one implementation to ever diverge from again — the actual root cause was
// two independent inline derivations of the same figure, not just one
// having a wrong constant.
//
// Never a floating amount: division happens once, immediately floored to an
// integer agorot (CLAUDE.md § Money) — matching MobileHome's own prior
// Math.floor (desktop's own prior Math.round is the one behavior change:
// rounding could push the displayed figure fractionally above the true
// total spendable amount, which floor never does).

import { localDateString } from '@/features/budgets/lib/budgetPeriod'

export function computeSafeToSpendPerDayAgorot(
  safeToSpendAgorot: number,
  horizonEndDate: string,
  todayDate: string = localDateString()
): number {
  if (safeToSpendAgorot <= 0) return 0
  // Inclusive of today — a household spending this exact figure every
  // remaining day of the horizon lands exactly on zero, not short of it.
  const daysLeft = Math.max(1, Math.round((Date.parse(horizonEndDate) - Date.parse(todayDate)) / 86_400_000) + 1)
  return Math.floor(safeToSpendAgorot / daysLeft)
}
