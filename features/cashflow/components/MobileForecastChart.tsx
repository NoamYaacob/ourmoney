// The balance forecast, drawn for a phone and for Hebrew.
//
// Two things separate this from CashFlowForecastChart (which the desktop
// screen keeps using, unchanged):
//
//   1. Time runs right to left. Today is at the start edge — the physical
//      right in this RTL app — and the horizon extends leftward, so the
//      curve advances in the direction the surrounding text reads. A chart
//      that runs the other way asks a Hebrew reader to reverse direction
//      mid-screen, which is what the design file corrected. The desktop
//      chart still runs left to right; that inconsistency is real and is
//      called out in the handoff notes rather than fixed here, because the
//      desktop screens are approved as they stand.
//   2. The low point is annotated, not just marked. A dashed line drops
//      from it to the axis and a callout names the amount and the date,
//      because on a 390px screen the household cannot read a value off an
//      unlabelled dip.
//
// It computes nothing. Every balance plotted is a `dailyPoints` entry from
// calculateCashFlowForecast; the only arithmetic here is turning agorot and
// dates into pixel coordinates.

import { Text, View } from 'react-native'
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Polyline, Stop } from 'react-native-svg'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { formatILS } from '@/lib/money/format'
import type { CashFlowDailyPoint } from '@/lib/engines/cashflow/calculateCashFlowForecast'

interface MobileForecastChartProps {
  dailyPoints: CashFlowDailyPoint[]
  lowestBalanceDate: string
  chartSummary: string
}

const W = 340
const H = 132
// Head-room above the curve so the callout has somewhere to sit without
// overlapping the line at its own peak.
const TOP_PAD = 20

function shortDate(isoDate: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate)
  return match ? `${match[2]}.${match[1]}` : isoDate
}

export function MobileForecastChart({ dailyPoints, lowestBalanceDate, chartSummary }: MobileForecastChartProps) {
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const line = isDark ? colors.accent.dark : colors.accent.light
  const danger = isDark ? colors.danger.dark : colors.danger.light
  const axis = isDark ? colors.border.dark : colors.border.light

  if (dailyPoints.length === 0) return null

  const balances = dailyPoints.map((point) => point.balanceAgorot)
  const minBalance = Math.min(0, ...balances)
  const maxBalance = Math.max(0, ...balances)
  const range = maxBalance - minBalance || 1

  const stepX = W / Math.max(1, dailyPoints.length - 1)
  // The mirror: index 0 (today) maps to the right edge.
  const xForIndex = (index: number) => W - index * stepX
  const yForBalance = (balance: number) => TOP_PAD + (H - TOP_PAD) * (1 - (balance - minBalance) / range)

  const zeroY = yForBalance(0)
  const points = dailyPoints.map((point, index) => `${xForIndex(index)},${yForBalance(point.balanceAgorot)}`)
  const polyline = points.join(' ')
  // The filled area closes down to the bottom edge on both ends.
  const area = `${W},${H} ${polyline} ${xForIndex(dailyPoints.length - 1)},${H}`

  const lowestIndex = dailyPoints.findIndex((point) => point.date === lowestBalanceDate)
  const lowest = lowestIndex >= 0 ? dailyPoints[lowestIndex] : undefined
  const lowestX = lowestIndex >= 0 ? xForIndex(lowestIndex) : 0
  const lowestY = lowest ? yForBalance(lowest.balanceAgorot) : 0
  const isNegative = (lowest?.balanceAgorot ?? 0) < 0

  const lastPoint = dailyPoints[dailyPoints.length - 1]
  const midPoint = dailyPoints[Math.floor(dailyPoints.length / 2)]

  return (
    <View accessible accessibilityLabel={chartSummary}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ position: 'relative' }}>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} testID="mobile-forecast-chart">
            <Defs>
              <LinearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={line} stopOpacity={0.16} />
                <Stop offset="1" stopColor={line} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            <Polygon points={area} fill="url(#forecastFill)" />
            <Line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke={axis} strokeWidth={1} />
            <Polyline points={polyline} fill="none" stroke={line} strokeWidth={2} />

            {lowest && (
              <>
                {/* Drops to the axis, not to the frame bottom: the line's
                    job is to tie the dip to the zero it is approaching. */}
                <Line
                  x1={lowestX}
                  y1={lowestY}
                  x2={lowestX}
                  y2={Math.max(zeroY, lowestY)}
                  stroke={isNegative ? danger : axis}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <Circle cx={lowestX} cy={lowestY} r={9} fill={isNegative ? danger : line} fillOpacity={0.18} />
                <Circle cx={lowestX} cy={lowestY} r={5} fill={isNegative ? danger : line} />
              </>
            )}
          </Svg>

          {/* The callout is a real Text view rather than SVG <Text> so it
              picks up the app's font and Dynamic Type. Positioned as a
              percentage of the same coordinate space the dot uses, so the
              two cannot drift apart when the chart resizes. */}
          {lowest && (
            <View
              className="absolute rounded-control px-2 py-1"
              style={{
                backgroundColor: isNegative ? danger : line,
                start: `${((W - lowestX) / W) * 100}%`,
                top: Math.max(0, lowestY - TOP_PAD - 14),
                transform: [{ translateX: -6 }],
              }}
            >
              <Text
                className="font-heeboBold text-meta"
                style={{ color: isDark ? colors.hero.light : '#ffffff', fontVariant: ['tabular-nums'] }}
                maxFontSizeMultiplier={1.2}
              >
                {formatILS(lowest.balanceAgorot)}
              </Text>
              <Text
                className="font-sansSemibold text-meta"
                style={{ color: isDark ? colors.hero.light : '#ffffff', opacity: 0.85 }}
                maxFontSizeMultiplier={1.2}
              >
                {shortDate(lowest.date)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Axis labels, in the same right-to-left order the curve runs. */}
      <View className="mt-1.5 flex-row justify-between">
        <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {shortDate(dailyPoints[0]!.date)}
        </Text>
        {midPoint && (
          <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {shortDate(midPoint.date)}
          </Text>
        )}
        <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {shortDate(lastPoint!.date)}
        </Text>
      </View>
    </View>
  )
}
