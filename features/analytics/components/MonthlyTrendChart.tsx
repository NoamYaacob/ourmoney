// Hand-built on react-native-svg — no charting library dependency, per the
// approved M7 design. Simple grouped bars (income/expense per month); the
// chart draws only, it never touches money arithmetic (that's monthlyTrend.ts).

import { Text, View } from 'react-native'
import Svg, { G, Rect } from 'react-native-svg'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { formatILS } from '@/lib/money/format'
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
  const incomeColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light
  const expenseColor = scheme === 'dark' ? colors.danger.dark : colors.danger.light

  const maxAgorot = Math.max(1, ...points.flatMap((p) => [p.incomeAgorot, p.expenseAgorot]))
  const groupWidth = BAR_WIDTH * 2 + BAR_GAP
  const chartWidth = points.length * groupWidth + Math.max(0, points.length - 1) * GROUP_GAP

  return (
    <View accessible accessibilityLabel={chartSummary}>
      <Svg
        width={chartWidth}
        height={CHART_HEIGHT}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
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
      <View className="mt-2 flex-row flex-wrap gap-3">
        {points.map((point) => (
          <Text key={point.periodStart} className="text-xs text-inkMuted-light dark:text-inkMuted-dark">
            {point.periodStart.slice(0, 7)}
          </Text>
        ))}
      </View>
    </View>
  )
}
