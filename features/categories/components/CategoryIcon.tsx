// Design Phase 2: the shared visual for "a category, drawn as an icon" —
// used everywhere Dashboard or Add Transaction shows a category (budget
// progress rows, recent transactions, the top-categories list, the
// account/category selection rows and bottom sheet). Centralizing this one
// small component is what makes the emoji→Ionicons swap (categoryIcon.ts)
// consistent across all of them instead of four separate ad hoc renderings.
import { View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { categoryIconName } from '../lib/categoryIcon'

interface CategoryIconProps {
  icon: string | null | undefined
  size?: 'sm' | 'md'
}

const SIZE = {
  sm: { container: 32, glyph: 16 },
  md: { container: 40, glyph: 19 },
} as const

export function CategoryIcon({ icon, size = 'md' }: CategoryIconProps) {
  const { colorScheme: scheme } = useColorScheme()
  const dims = SIZE[size]
  const glyphColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark"
      style={{ width: dims.container, height: dims.container }}
    >
      <Ionicons name={categoryIconName(icon)} size={dims.glyph} color={glyphColor} />
    </View>
  )
}
