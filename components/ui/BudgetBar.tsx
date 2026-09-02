// The budget/category bar, with the two things a plain ProgressBar can't
// say: where the household *should* be by today, and whether the fill in
// front of them is an overrun rather than progress.
//
// The pace marker is the small dark tick sitting at "how far through the
// month are we". A bar at 81% means nothing on its own; a bar at 81% with
// the marker at 71% says "ten points ahead of pace" at a glance, which is
// the actual question the design set out to answer.
//
// Overruns are hatched, not just red. Color alone must never carry status
// (CLAUDE.md § accessibility), and this is the one place in the product
// where the status IS the bar — there is no room for a word inside it. The
// hatch is drawn with react-native-svg, already a dependency for the charts.
// Callers still pair the bar with a StatusChip; the hatch is the redundancy
// inside the bar itself, not a replacement for the label.

import { useState } from 'react'
import { View } from 'react-native'
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg'
import { colors } from '@/constants/colors'
import { useColorScheme } from 'nativewind'

interface BudgetBarProps {
  // 0..n — may exceed 100, which is what an overrun looks like.
  percent: number
  // 0..100, or null when the period has no meaningful pace (a bar for a
  // finished month, a goal with no target date). Null hides the marker
  // rather than parking it at zero.
  pacePercent?: number | null
  // 'over' hatches the fill. Passed in rather than derived from
  // `percent >= 100` so the caller's own engine result stays the single
  // source of truth for what counts as an overrun.
  state: 'healthy' | 'approaching' | 'over'
  height?: number
  accessibilityLabel: string
}

const FILL_TOKEN = {
  healthy: 'positive',
  approaching: 'warning',
  over: 'danger',
} as const

export function BudgetBar({ percent, pacePercent = null, state, height = 8, accessibilityLabel }: BudgetBarProps) {
  const { colorScheme } = useColorScheme()
  const [width, setWidth] = useState(0)
  const clamped = Math.min(100, Math.max(0, percent))
  const token = FILL_TOKEN[state]
  const scheme = colorScheme === 'dark' ? 'dark' : 'light'
  const fill = colors[token][scheme]
  const hatch = colors[state === 'over' ? 'dangerStrong' : token][scheme]

  return (
    <View
      className="w-full flex-row"
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      // `now` stays inside the declared range even when the household is
      // over budget — assistive tech treats an out-of-range value as
      // invalid, and the overrun is already announced by the label.
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View
        className="relative w-full overflow-hidden rounded-full bg-track-light dark:bg-track-dark"
        style={{ height }}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {state === 'over' ? (
          // A full-width hatched bar: an overrun has no "remaining" portion
          // left to show, so the fill runs the whole track.
          <Svg width="100%" height={height}>
            <Defs>
              <Pattern id="overrun" width={10} height={10} patternUnits="userSpaceOnUse">
                <Rect width={10} height={10} fill={fill} />
                <Line x1={0} y1={10} x2={10} y2={0} stroke={hatch} strokeWidth={5} />
              </Pattern>
            </Defs>
            <Rect width="100%" height={height} fill="url(#overrun)" />
          </Svg>
        ) : (
          <View className="h-full rounded-full" style={{ width: `${clamped}%`, backgroundColor: fill }} />
        )}

        {pacePercent !== null && width > 0 && (
          // Positioned with `start` (not `left`) so it mirrors with the rest
          // of the RTL layout — the bar fills from the start edge, and the
          // marker has to travel the same direction the fill does.
          <View
            className="absolute bg-ink-light dark:bg-ink-dark"
            style={{
              start: (Math.min(100, Math.max(0, pacePercent)) / 100) * width,
              top: -2,
              bottom: -2,
              width: 2,
            }}
          />
        )}
      </View>
    </View>
  )
}
