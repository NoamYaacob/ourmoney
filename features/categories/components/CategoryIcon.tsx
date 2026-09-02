// A category, drawn as the design draws it: the household's own emoji in a
// rounded-square tile.
//
// This used to swap every emoji for an Ionicon (categoryIcon.ts's own
// mapping), on the reasoning that emoji read as inconsistent beside an
// icon-based UI. The approved design decides the other way, and does it
// everywhere — `OurMoney - Mobile.dc.html` screens 07/08/09, the desktop
// Budget and Credit frames, and the Design System's own category tiles all
// show the emoji itself in a light rounded square. It is also the truer
// rendering: `categories.icon` stores an emoji, a household picks it, and
// the mapping silently replaced anything it did not recognize with a generic
// tag — so a custom category chosen as a birthday cake came back a pricetag.
//
// The Ionicon mapping stays as the fallback for a stored value that is not
// an emoji at all, and `categoryIconName` is still exported for the places
// that need a glyph NAME rather than a rendered tile (Select's option rows).

import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { categoryIconName } from '../lib/categoryIcon'

interface CategoryIconProps {
  icon: string | null | undefined
  size?: 'sm' | 'md'
}

const SIZE = {
  // Radius tracks the tile, at roughly the 0.3 ratio the design files use (a
  // 30px tile takes 9, a 38px tile takes 12) — snapped to the design
  // system's own radius scale rather than a free number per call site.
  sm: { container: 32, glyph: 16, radiusClass: 'rounded-control' },
  md: { container: 40, glyph: 19, radiusClass: 'rounded-row' },
} as const

// The stored value is an emoji, and an emoji is by definition outside Basic
// Latin. Anything ASCII is something else — a legacy icon name, a stray
// letter — and goes through the Ionicon fallback rather than being rendered
// as literal text.
const NON_ASCII = /[^\u0000-\u007F]/

export function CategoryIcon({ icon, size = 'md' }: CategoryIconProps) {
  const { colorScheme: scheme } = useColorScheme()
  const dims = SIZE[size]
  const glyphColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light
  const trimmed = icon?.trim() ?? ''

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`flex-none items-center justify-center bg-surface-light dark:bg-surface-dark ${dims.radiusClass}`}
      style={{ width: dims.container, height: dims.container }}
    >
      {trimmed && NON_ASCII.test(trimmed) ? (
        <Text
          // Capped growth: the tile is a fixed square, so an emoji scaled by
          // a large Dynamic Type setting would clip rather than help.
          maxFontSizeMultiplier={1.2}
          style={{ fontSize: dims.glyph, lineHeight: dims.glyph * 1.25 }}
        >
          {trimmed}
        </Text>
      ) : (
        <Ionicons name={categoryIconName(icon)} size={dims.glyph} color={glyphColor} />
      )}
    </View>
  )
}
