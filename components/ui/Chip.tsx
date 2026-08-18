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
          ? 'rounded-full bg-slate-900 px-4 py-2 dark:bg-slate-100'
          : 'rounded-full border border-border-light bg-surfaceMuted-light px-4 py-2 dark:border-border-dark dark:bg-surfaceMuted-dark'
      }
    >
      <Text
        className={
          selected ? 'text-sm font-semibold text-white dark:text-slate-900' : 'text-sm text-ink-light dark:text-ink-dark'
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}
