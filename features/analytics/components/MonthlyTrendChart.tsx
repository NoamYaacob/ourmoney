// Hand-built on react-native-svg — no charting library dependency, per the
// approved M7 design. Simple grouped bars (income/expense per month); the
// chart draws only, it never touches money arithmetic (that's monthlyTrend.ts).

import { Text, View } from 'react-native'
import Svg, { G, Rect } from 'react-native-svg'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { formatILS } from '@/lib/money/format'
import { formatMonthShortLabel } from '@/features/budgets/lib/budgetPeriod'
import type { MonthlyTrendPoint } from '../lib/monthlyTrend'

interface MonthlyTrendChartProps {
  points: MonthlyTrendPoint[]
}

const CHART_HEIGHT = 120
const BAR_WIDTH = 10
const BAR_GAP = 6
const GROUP_GAP = 14

export function MonthlyTrendChart({ points }: MonthlyTrendChartProps) {
  const { colorScheme: scheme } = useColorScheme()
  const { t } = useTranslation()
  // react-native-svg elements carry no accessibility semantics of their
  // own — a screen reader gets nothing at all from the bars themselves.
  // The wrapping View is marked accessible with a summary built from the
  // same numbers the bars are drawn from (already-formatted ILS, so no
  // duplicate formatting logic), and the SVG underneath is hidden so
  // VoiceOver/TalkBack announces one meaningful sentence instead of
  // silently skipping the whole chart.
  const chartSummary = points
    .map((p) => `${p.periodStart.slice(0, 7)}: ${t('dashboard.analytics.income')} ${formatILS(p.incomeAgorot)}, ${t('dashboard.analytics.expense')} ${formatILS(p.expenseAgorot)}`)
    .join('. ')
  // positive/danger — the same financial-meaning tokens used everywhere
  // else a figure's sign matters (see constants/colors.ts). Not accent:
  // accent is reserved for interactive elements, not a data readout.
  const incomeColor = scheme === 'dark' ? colors.positive.dark : colors.positive.light
  const expenseColor = scheme === 'dark' ? colors.danger.dark : colors.danger.light

  const maxAgorot = Math.max(1, ...points.flatMap((p) => [p.incomeAgorot, p.expenseAgorot]))
  const groupWidth = BAR_WIDTH * 2 + BAR_GAP
  const chartWidth = points.length * groupWidth + Math.max(0, points.length - 1) * GROUP_GAP

  return (
    <View accessible accessibilityLabel={chartSummary}>
      {/* accessibilityElementsHidden/importantForAccessibility live on this
          wrapping View, not on <Svg> itself: react-native-svg's web shape
          forwards every prop straight to the DOM with no allowlist (unlike
          react-native-web's View, which silently drops RN-only props it
          doesn't recognize), so setting them on <Svg> produced a React DOM
          warning on web with zero actual effect there. A View ancestor
          hides the same descendant subtree from the native accessibility
          tree — identical native behavior, no web warning. */}
      <View testID="monthly-trend-chart-hidden-wrapper" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg testID="monthly-trend-chart-svg" width={chartWidth} height={CHART_HEIGHT}>
          {points.map((point, index) => {
            const groupX = index * (groupWidth + GROUP_GAP)
            const incomeHeight = (point.incomeAgorot / maxAgorot) * CHART_HEIGHT
            const expenseHeight = (point.expenseAgorot / maxAgorot) * CHART_HEIGHT
            return (
              <G key={point.periodStart}>
                <Rect
                  x={groupX}
                  y={CHART_HEIGHT - incomeHeight}
                  width={BAR_WIDTH}
                  height={incomeHeight}
                  fill={incomeColor}
                  rx={2}
                />
                <Rect
                  x={groupX + BAR_WIDTH + BAR_GAP}
                  y={CHART_HEIGHT - expenseHeight}
                  width={BAR_WIDTH}
                  height={expenseHeight}
                  fill={expenseColor}
                  rx={2}
                />
              </G>
            )
          })}
        </Svg>
      </View>
      <View className="mt-2 flex-row flex-wrap gap-3">
        {points.map((point) => (
          <Text key={point.periodStart} className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
            {formatMonthShortLabel(point.periodStart)}
          </Text>
        ))}
      </View>
    </View>
  )
}
