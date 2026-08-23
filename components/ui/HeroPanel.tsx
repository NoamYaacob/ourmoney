// The dark financial panel. One per screen, carrying the figure that
// answers that screen's question — פנוי באמת on Home, the equals row on the
// breakdown, the next charge on Credit.
//
// It is a surface, not a layout: callers compose their own contents inside
// it. What this component owns is the treatment (fill, radius, padding) and
// the on-dark text tokens, so a second dark panel elsewhere in the product
// can't quietly pick different greys — which is exactly what happened
// before the tokens existed.

import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'

interface HeroPanelProps {
  children: ReactNode
  onPress?: () => void
  accessibilityLabel?: string
  className?: string
  testID?: string
}

export function HeroPanel({ children, onPress, accessibilityLabel, className = '', testID }: HeroPanelProps) {
  const surface = `rounded-hero bg-hero-light p-5 dark:bg-hero-dark ${className}`

  if (!onPress) {
    return (
      <View testID={testID} className={surface}>
        {children}
      </View>
    )
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`${surface} active:opacity-90`}
    >
      {children}
    </Pressable>
  )
}

// The panel's small uppercase-ish label ("פנוי באמת · עד סוף אוגוסט"). The
// letter-spacing is what the design uses to separate it from the figure
// underneath without making it larger.
export function HeroLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="text-meta font-sansSemibold tracking-[0.1em] text-heroInkMuted-light" maxFontSizeMultiplier={1.6}>
      {children}
    </Text>
  )
}

// Explanatory prose on the panel.
export function HeroNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Text className={`text-caption font-sans text-heroInkMuted-light ${className}`} maxFontSizeMultiplier={1.6}>
      {children}
    </Text>
  )
}

// The outlined pill the design puts beside the big number to say what it is
// NOT ("זו לא היתרה בבנק"). Outlined rather than filled so it reads as an
// annotation on the figure instead of competing with it.
export function HeroTag({ children }: { children: ReactNode }) {
  return (
    <View className="self-start rounded-full border border-heroBorder-light px-2.5 py-0.5">
      <Text className="text-meta font-sansSemibold text-heroInkMuted-light" maxFontSizeMultiplier={1.6}>
        {children}
      </Text>
    </View>
  )
}

// One line of the waterfall legend: a colour key, a label, and its amount.
//
// The square is what makes the bar above it readable at all — the design
// system calls the waterfall "הרכיב החתימה" and its whole point is showing
// the subtraction, which only works if each legend row is tied to the
// segment it names. 9px at radius 3, matching the mockup; a circle would
// read as a status dot, which it is not.
export function HeroLegendRow({
  label,
  swatchColor,
  emphasis = false,
  children,
}: {
  label: string
  // Omitted for the closing total, which is a sum rather than a segment.
  swatchColor?: string
  emphasis?: boolean
  children: ReactNode
}) {
  return (
    <View className="flex-row items-center gap-2">
      {swatchColor ? (
        <View className="h-[9px] w-[9px] rounded-[3px]" style={{ backgroundColor: swatchColor }} />
      ) : (
        <View className="h-[9px] w-[9px]" />
      )}
      <Text
        className={`flex-1 text-caption ${
          emphasis ? 'font-sansSemibold text-heroInk-light' : 'font-sans text-heroInkMuted-light'
        }`}
        maxFontSizeMultiplier={1.6}
      >
        {label}
      </Text>
      {children}
    </View>
  )
}
