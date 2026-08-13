import { View } from 'react-native'

interface ProgressBarProps {
  percent: number | null // null = no allocation, renders an empty track only
  overBudget?: boolean
}

export function ProgressBar({ percent, overBudget = false }: ProgressBarProps) {
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent))
  // `positive` is the financial-good token (under budget); `danger` only
  // once a category is actually at/over its allocation. Not `accent` —
  // accent is reserved for interactive elements, not a status readout.
  const barColor = overBudget || (percent ?? 0) >= 100 ? 'bg-danger-light dark:bg-danger-dark' : 'bg-positive-light dark:bg-positive-dark'

  return (
    <View
      className="h-2 w-full overflow-hidden rounded-full bg-border-light dark:bg-border-dark"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent ?? 0 }}
    >
      <View className={`h-full rounded-full ${barColor}`} style={{ width: `${clamped}%` }} />
    </View>
  )
}
