// Hand-built on react-native-svg (stroke-dasharray ring technique) — no
// charting library dependency. Pure rendering; all totals are already
// computed by categoryBreakdown.ts before this component ever sees them.

import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import { formatILS } from '@/lib/money/format'
import type { CategoryBreakdownEntry } from '../lib/categoryBreakdown'

interface CategoryDonutChartProps {
  breakdown: CategoryBreakdownEntry[]
  categoryNameById?: Record<string, string>
  size?: number
}

// A small, fixed palette cycled by index — categories don't currently carry
// a chart-specific color (categories.color exists for other UI, but reusing
// it here isn't required by the M7 spec), so a stable, distinct rotation is
// simplest and fully deterministic.
const SEGMENT_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

export function CategoryDonutChart({ breakdown, categoryNameById = {}, size = 140 }: CategoryDonutChartProps) {
  const { t } = useTranslation()
  const radius = size / 2 - 10
  const circumference = 2 * Math.PI * radius
  const totalAgorot = breakdown.reduce((sum, entry) => sum + entry.spentAgorot, 0)

  let offsetSoFar = 0

  // Same rationale as MonthlyTrendChart: a Circle-based ring has no
  // accessibility semantics of its own, so the wrapping View carries a
  // built summary and the Svg is hidden from the accessibility tree.
  const chartSummary = breakdown
    .map((entry) => `${categoryNameById[entry.categoryId] ?? entry.categoryId}: ${formatILS(entry.spentAgorot)}`)
    .join('. ')

  return (
    <View accessible accessibilityLabel={chartSummary || t('dashboard.analytics.empty')} style={{ width: size, height: size }}>
      {/* accessibilityElementsHidden/importantForAccessibility live on this
          wrapping View, not on <Svg> itself — see MonthlyTrendChart.tsx's
          matching comment for why: react-native-svg's web shape forwards
          every prop straight to the DOM with no allowlist, unlike
          react-native-web's View, which silently drops RN-only props it
          doesn't recognize. */}
      <View testID="category-donut-chart-hidden-wrapper" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg testID="category-donut-chart-svg" width={size} height={size}>
          {totalAgorot <= 0 ? (
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#e2e8f0" strokeWidth={14} fill="none" />
          ) : (
            breakdown.map((entry, index) => {
              const fraction = entry.spentAgorot / totalAgorot
              const dashLength = fraction * circumference
              const dashOffset = -offsetSoFar
              offsetSoFar += dashLength
              return (
                <Circle
                  key={entry.categoryId}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={SEGMENT_COLORS[index % SEGMENT_COLORS.length]}
                  strokeWidth={14}
                  fill="none"
                  strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                  strokeDashoffset={dashOffset}
                  // Segments are drawn starting from the top (12 o'clock),
                  // rotating clockwise — a plain -90deg rotation around the
                  // circle's own center achieves that regardless of RTL.
                  rotation={-90}
                  origin={`${size / 2}, ${size / 2}`}
                />
              )
            })
          )}
        </Svg>
      </View>
    </View>
  )
}
