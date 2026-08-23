// The balance forecast, drawn once for both platforms.
//
// This started as two charts. The desktop screen had a plain black polyline
// running left to right with per-day danger columns behind it; the phone had
// the design's own treatment. Both design files specify the *same* chart —
// `OurMoney - Mobile.dc.html` screen 06 and `OurMoney - Desktop.dc.html`'s
// Cash Flow frame draw an identical accent gradient area, a zero rule, a
// dashed drop-line to the low point, a haloed marker and a callout — so the
// two implementations were a drift, not a design decision. One component
// now, with a `variant` for the two canvases the files actually differ on:
// 132px tall with three date labels on a phone, 178px with four and a
// currency-suffixed zero label on desktop.
//
// Time runs right to left. Today sits at the start edge — the physical right
// in this RTL app — and the horizon extends leftward, so the curve advances
// in the direction the surrounding text reads. SVG has no `dir`: its
// coordinate space is unaffected by the document's direction, so the mirror
// has to be arithmetic (`W - index * stepX`) rather than a style. That is
// why the desktop chart read backwards before this pass — nothing was wrong
// with its CSS, it simply plotted index 0 at x=0.
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

export type ForecastChartVariant = 'compact' | 'wide'

interface ForecastChartProps {
  dailyPoints: CashFlowDailyPoint[]
  lowestBalanceDate: string
  chartSummary: string
  /** `compact` is the phone frame, `wide` the desktop one. */
  variant?: ForecastChartVariant
}

// The viewBox is only an aspect ratio — the SVG itself is width="100%" — so
// these are the design's own proportions rather than rendered pixels.
const GEOMETRY: Record<ForecastChartVariant, { w: number; h: number; ticks: number; zeroLabel: string }> = {
  compact: { w: 340, h: 132, ticks: 3, zeroLabel: '0' },
  wide: { w: 1080, h: 178, ticks: 4, zeroLabel: '0 ₪' },
}

// Head-room above the curve so the callout has somewhere to sit without
// overlapping the line at its own peak.
const TOP_PAD = 20

function shortDate(isoDate: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(isoDate)
  return match ? `${match[2]}.${match[1]}` : isoDate
}

export function ForecastChart({
  dailyPoints,
  lowestBalanceDate,
  chartSummary,
  variant = 'compact',
}: ForecastChartProps) {
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const line = isDark ? colors.accent.dark : colors.accent.light
  const danger = isDark ? colors.danger.dark : colors.danger.light
  const axis = isDark ? colors.border.dark : colors.border.light

  if (dailyPoints.length === 0) return null

  const { w: W, h: H, ticks, zeroLabel } = GEOMETRY[variant]

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

  // Evenly spaced date labels, in the same right-to-left order the curve
  // runs: today first, the horizon's end last.
  const tickIndexes = Array.from({ length: ticks }, (_, i) =>
    Math.round((i * (dailyPoints.length - 1)) / Math.max(1, ticks - 1))
  )

  return (
    <View accessible accessibilityLabel={chartSummary}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ position: 'relative' }}>
          <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} testID="forecast-chart">
            <Defs>
              <LinearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={line} stopOpacity={0.16} />
                <Stop offset="1" stopColor={line} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            <Polygon points={area} fill="url(#forecastFill)" />
            <Line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke={axis} strokeWidth={1} />
            <Polyline testID="forecast-chart-line" points={polyline} fill="none" stroke={line} strokeWidth={2} />

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

          {/* The zero rule's own label, at the start edge just above the
              line — the design puts a number on that rule so the crossing
              means something without reading the axis. */}
          <Text
            className="absolute text-meta font-sansSemibold text-inkMuted-light dark:text-inkMuted-dark"
            style={{ start: 0, top: `${(zeroY / H) * 100}%`, transform: [{ translateY: -16 }] }}
            maxFontSizeMultiplier={1.2}
          >
            {zeroLabel}
          </Text>

          {/* The callout is a real Text view rather than SVG <Text> so it
              picks up the app's font and Dynamic Type. Positioned as a
              percentage of the same coordinate space the dot uses, so the
              two cannot drift apart when the chart resizes. */}
          {lowest && (
            <View
              testID="forecast-chart-callout"
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
        {tickIndexes.map((pointIndex, i) => (
          <Text
            key={`${pointIndex}-${i}`}
            className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark"
          >
            {shortDate(dailyPoints[pointIndex]?.date ?? dailyPoints[0]!.date)}
          </Text>
        ))}
      </View>
    </View>
  )
}
