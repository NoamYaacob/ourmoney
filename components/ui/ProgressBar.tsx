import { View } from 'react-native'

interface ProgressBarProps {
  percent: number | null // null = no allocation, renders an empty track only
  overBudget?: boolean
  // When true, reaching/exceeding 100% is the GOAL, not an overspend (e.g. a
  // savings goal) — the bar stays positive at any percent instead of
  // flipping to danger at >=100%. Default false preserves the budget-
  // progress semantics every existing caller relies on exactly
  // (UX-completeness audit finding: a goal's bar turning red right next to
  // its own "היעד הושג! 🎉" celebration text read as contradictory).
  positiveAtLimit?: boolean
  // Track thickness, e.g. `'h-3'`. Defaults to the original `h-2` every
  // existing caller (Budget, Home's goal rows) already relies on — Goals'
  // own list (Checkpoint 6) is the one caller that wants the bar to read as
  // the row's dominant element rather than a thin decorative strip.
  heightClass?: string
}

export function ProgressBar({ percent, overBudget = false, positiveAtLimit = false, heightClass = 'h-2' }: ProgressBarProps) {
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent))
  // `positive` is the financial-good token (under budget, or goal reached);
  // `danger` only once a category is actually at/over its allocation. Not
  // `accent` — accent is reserved for interactive elements, not a status
  // readout.
  const isAtOrOverLimit = overBudget || (percent ?? 0) >= 100
  const barColor =
    isAtOrOverLimit && !positiveAtLimit ? 'bg-danger-light dark:bg-danger-dark' : 'bg-positive-light dark:bg-positive-dark'

  return (
    <View
      className={`${heightClass} w-full overflow-hidden rounded-full bg-border-light dark:bg-border-dark`}
      accessibilityRole="progressbar"
      // `now` must stay within the declared [min, max] range even when
      // `percent` legitimately exceeds 100 (overspending) — assistive tech
      // treats an out-of-range `now` as invalid. Reuses the same `clamped`
      // value already driving the visual bar width, so the announced value
      // and the rendered width never disagree; the overspending state
      // itself is still fully conveyed via `overBudget`/color, unaffected.
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
    >
      <View className={`h-full rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
    </View>
  )
}
