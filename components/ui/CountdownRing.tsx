// A small ring showing "how far through a cycle are we", with the days-left
// count inside it — the credit-card billing-cycle countdown on Dashboard
// and the Credit & Payments screen. Built the same way CategoryDonutChart
// already draws a ring (an SVG circle + a stroke-dasharray offset), rather
// than a second technique for what is visually the same shape.

import { Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

interface CountdownRingProps {
  // 0..100 — how far through the cycle today is, not how many days remain.
  percentElapsed: number
  daysLeft: number
  size?: number
  // The dark hero variant (on HeroPanel) vs the light card variant.
  tone?: 'onDark' | 'onLight'
}

export function CountdownRing({ percentElapsed, daysLeft, size = 52, tone = 'onLight' }: CountdownRingProps) {
  const { colorScheme: scheme } = useColorScheme()
  const isDark = scheme === 'dark'
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, percentElapsed))
  const dashOffset = circumference * (1 - clamped / 100)

  const trackColor = tone === 'onDark' ? colors.heroBorder.light : isDark ? colors.track.dark : colors.track.light
  const fillColor = tone === 'onDark' ? colors.heroAccent.light : isDark ? colors.accent.dark : colors.accent.light
  const innerBg = tone === 'onDark' ? colors.hero.light : isDark ? colors.surfaceMuted.dark : colors.surfaceMuted.light
  const textColor = tone === 'onDark' ? colors.heroInk.light : isDark ? colors.ink.dark : colors.ink.light
  const labelColor = tone === 'onDark' ? colors.heroInkMuted.light : isDark ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={fillColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          // The ring starts at 12 o'clock and fills clockwise regardless of
          // RTL — a progress ring has no reading direction to mirror.
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View
        className="items-center justify-center rounded-full"
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
      >
        <View
          className="items-center justify-center rounded-full"
          style={{ width: size - stroke * 2.4, height: size - stroke * 2.4, backgroundColor: innerBg }}
        >
          <Text className="font-heeboBold text-caption" style={{ color: textColor, lineHeight: 15 }} maxFontSizeMultiplier={1.4}>
            {daysLeft}
          </Text>
          <Text className="text-meta" style={{ color: labelColor }} maxFontSizeMultiplier={1.4}>
            ימים
          </Text>
        </View>
      </View>
    </View>
  )
}
