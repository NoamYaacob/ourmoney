import { Pressable, Text } from 'react-native'

interface ChipProps {
  label: string
  selected: boolean
  onPress: () => void
  testID?: string
}

export function Chip({ label, selected, onPress, testID }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={
        selected
          ? 'rounded-full bg-accent-light px-4 py-2 dark:bg-accent-dark'
          : 'rounded-full border border-border-light bg-surfaceMuted-light px-4 py-2 dark:border-border-dark dark:bg-surfaceMuted-dark'
      }
    >
      <Text
        // Same white/ink.light flip Button's primary variant uses —
        // accent.dark is a bright fill, not a dark one, so white text on it
        // fails contrast (constants/colors.ts's own audit).
        className={
          selected ? 'text-sm font-semibold text-white dark:text-ink-light' : 'text-sm text-ink-light dark:text-ink-dark'
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}
