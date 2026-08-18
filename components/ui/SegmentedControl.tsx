// Design Phase 2: a real segmented control (iOS-style pill-in-a-track),
// replacing the two-separate-Chips pattern for exactly-one-of-N choices —
// Chip stays as-is for its existing multi-select/filter uses elsewhere.
// Selected state is never color-only: the selected segment also gets its
// own filled pill background, so it reads correctly even without color
// vision (constants/accessibility.ts's touch-target discipline applies
// here too — each segment is a full-height Pressable, not just its text).
import { Pressable, Text, View } from 'react-native'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  // Selected-state text color. 'ink' (default) is the neutral choice —
  // deliberately not used for anything alarming; 'positive' is for options
  // that represent a financially good state (e.g. income); 'accent' is for
  // an option that is neither good nor bad — money moving, not gained or
  // spent (e.g. an internal transfer, migration 008/ADR-035) — using the
  // app's existing branded accent rather than inventing a new hue.
  tint?: 'ink' | 'positive' | 'accent'
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  accessibilityLabel: string
}

const TINT_TEXT: Record<'ink' | 'positive' | 'accent', string> = {
  ink: 'text-ink-light dark:text-ink-dark',
  positive: 'text-positive-light dark:text-positive-dark',
  accent: 'text-accent-light dark:text-accent-dark',
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row gap-1 rounded-control border border-border-light bg-surfaceMuted-light p-1 web:flex-row-reverse dark:border-border-dark dark:bg-surfaceMuted-dark"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            className={
              selected
                ? 'flex-1 items-center rounded-control bg-surface-light py-2.5 dark:bg-surface-dark'
                : 'flex-1 items-center rounded-control py-2.5 active:opacity-60'
            }
          >
            <Text
              className={
                selected
                  ? `text-body font-semibold ${TINT_TEXT[option.tint ?? 'ink']}`
                  : 'text-body font-medium text-inkMuted-light dark:text-inkMuted-dark'
              }
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
