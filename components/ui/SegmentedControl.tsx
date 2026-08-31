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
  // Product-quality pass: optional so every existing caller (which relied on
  // accessibilityLabel-based queries) is untouched — added specifically so a
  // filter-style caller (e.g. Transactions' type/shared filters, migrated off
  // a loose Chip row onto this component) can keep its existing
  // getByTestId(...)-based test coverage working unchanged.
  testID?: string
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
      className="flex-row gap-1 rounded-control border border-border-light bg-surfaceMuted-light p-1 web:flex-row dark:border-border-dark dark:bg-surfaceMuted-dark"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            // CP8D fix: `accessibilityRole="radio"`'s own correct semantic
            // state key is `checked` (maps to the real `aria-checked` on
            // web), not `selected` — the two were never a valid pair, so
            // no screen reader ever actually heard which segment was
            // selected. `selected` stays too, so nothing that already
            // reads it (this file's own tests, callers elsewhere) changes.
            accessibilityState={{ selected, checked: selected }}
            // RRR §16 P0-4: accessibilityState's object form is silently
            // dropped by react-native-web 0.21's DOM-prop whitelist — it
            // never reaches aria-checked on web, even though this file's
            // own CP8D fix correctly paired role="radio" with `checked`.
            // aria-checked is RN-native too (mapped to platform
            // accessibility state), so this is not web-only duplication.
            aria-checked={selected}
            accessibilityLabel={option.label}
            className={
              selected
                ? 'flex-1 items-center rounded-control bg-surface-light py-2.5 dark:bg-surface-dark'
                : 'flex-1 items-center rounded-control py-2.5 web:hover:bg-surface-light/60 active:opacity-60 dark:web:hover:bg-surface-dark/60'
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
