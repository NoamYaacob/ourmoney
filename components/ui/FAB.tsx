import { Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

interface FABProps {
  onPress: () => void
  accessibilityLabel: string
}

// Reached via FAB, not a tab — docs/ARCHITECTURE.md's Application Structure
// tree for transactions/new.tsx.
export function FAB({ onPress, accessibilityLabel }: FABProps) {
  const { colorScheme: scheme } = useColorScheme()

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="absolute bottom-6 end-6 h-14 w-14 items-center justify-center rounded-full bg-accent-light shadow-lg active:opacity-80 dark:bg-accent-dark"
    >
      {/* Same white/ink.light flip as Button's primary variant — accent.dark is a bright fill, not a dark one. */}
      <Ionicons name="add" size={28} color={scheme === 'dark' ? colors.ink.light : '#ffffff'} />
    </Pressable>
  )
}
