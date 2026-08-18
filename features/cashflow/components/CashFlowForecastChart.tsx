// Hand-built on react-native-svg, same as
// features/analytics/components/MonthlyTrendChart.tsx — no charting library
// dependency (package.json audited before writing this: react-native-svg is
// already the only chart-adjacent dependency; nothing else exists to
// reuse). The chart draws only, it never touches money arithmetic — every
// figure it plots comes straight from calculateCashFlowForecast.ts's
// already-computed dailyPoints.
//
// Responsive via SVG's own viewBox mechanism (width="100%" + a fixed
// internal viewBox) rather than measuring the container — works at both
// mobile and desktop widths with one implementation, no breakpoint logic.

import { Text, View } from 'react-native'
import Svg, { Circle, G, Line, Polyline, Rect } from 'react-native-svg'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { formatILS } from '@/lib/money/format'
import type { CashFlowDailyPoint } from '@/lib/engines/cashflow/calculateCashFlowForecast'

interface CashFlowForecastChartProps {
  dailyPoints: CashFlowDailyPoint[]
  lowestBalanceDate: string
  chartSummary: string
}

const CHART_WIDTH = 400
const CHART_HEIGHT = 160
const POINT_RADIUS = 4

export function CashFlowForecastChart({ dailyPoints, lowestBalanceDate, chartSummary }: CashFlowForecastChartProps) {
  const { colorScheme: scheme } = useColorScheme()
  const lineColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light
  const zeroLineColor = scheme === 'dark' ? colors.border.dark : colors.border.light
  const dangerColor = scheme === 'dark' ? colors.danger.dark : colors.danger.light
  const dangerFillColor = scheme === 'dark' ? `${colors.danger.dark}26` : `${colors.danger.light}1a`
  const inkMutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  // No days at all shouldn't happen (calculateCashFlowForecast always
  // covers at least [startDate, endDate] inclusive), but a chart must
  // never crash on a malformed/empty input — render nothing rather than
  // divide by zero below.
  if (dailyPoints.length === 0) {
    return null
  }

  const balances = dailyPoints.map((p) => p.balanceAgorot)
  const minBalance = Math.min(0, ...balances)
  const maxBalance = Math.max(0, ...balances)
  // A perfectly flat balance sitting exactly at 0 would make maxY - minY
  // zero — guard the denominator rather than divide by zero.
  const range = maxBalance - minBalance || 1

  const stepX = CHART_WIDTH / Math.max(1, dailyPoints.length - 1)
  const xForIndex = (index: number) => index * stepX
  const yForBalance = (balance: number) => CHART_HEIGHT - ((balance - minBalance) / range) * CHART_HEIGHT

  const zeroY = yForBalance(0)
  const polylinePoints = dailyPoints.map((p, i) => `${xForIndex(i)},${yForBalance(p.balanceAgorot)}`).join(' ')
  const lowestIndex = dailyPoints.findIndex((p) => p.date === lowestBalanceDate)
  const lowestPoint = lowestIndex >= 0 ? dailyPoints[lowestIndex] : undefined

  return (
    <View accessible accessibilityLabel={chartSummary}>
      <View testID="cash-flow-forecast-chart-hidden-wrapper" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg testID="cash-flow-forecast-chart-svg" width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
          {/* Shortfall region: one light-danger column per day the
              projected balance is negative, drawn behind the balance line. */}
          {dailyPoints.map((point, index) =>
            point.balanceAgorot < 0 ? (
              <Rect
                key={`shortfall-${point.date}`}
                x={xForIndex(index) - stepX / 2}
                y={0}
                width={stepX}
                height={CHART_HEIGHT}
                fill={dangerFillColor}
              />
            ) : null
          )}

          <Line x1={0} y1={zeroY} x2={CHART_WIDTH} y2={zeroY} stroke={zeroLineColor} strokeWidth={1} />

          <Polyline points={polylinePoints} fill="none" stroke={lineColor} strokeWidth={2} />

          {/* Today/start marker — dailyPoints[0] is always startDate. */}
          <Circle cx={xForIndex(0)} cy={yForBalance(dailyPoints[0]!.balanceAgorot)} r={POINT_RADIUS} fill={lineColor} />

          {lowestPoint && (
            <G>
              <Circle
                cx={xForIndex(lowestIndex)}
                cy={yForBalance(lowestPoint.balanceAgorot)}
                r={POINT_RADIUS}
                fill={lowestPoint.balanceAgorot < 0 ? dangerColor : inkMutedColor}
              />
            </G>
          )}
        </Svg>
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{formatILS(dailyPoints[0]!.balanceAgorot)}</Text>
        <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">
          {formatILS(dailyPoints[dailyPoints.length - 1]!.balanceAgorot)}
        </Text>
      </View>
    </View>
  )
}
