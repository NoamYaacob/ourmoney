// Native date picker (Milestone 7 — replaces free-form date text entry per
// the approved M7 design). Value/onChange are always plain YYYY-MM-DD local
// calendar-date strings, matching budgetPeriod.ts's convention — the Date
// object only ever exists transiently inside this component, parsed and
// re-serialized via local getters (never toISOString(), which is UTC and
// can shift the day near midnight in Asia/Jerusalem).

import { useState } from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'

interface DatePickerFieldProps {
  label: string
  value: string // YYYY-MM-DD
  onChange: (value: string) => void
}

export function DatePickerField({ label, value, onChange }: DatePickerFieldProps) {
  const [isOpen, setIsOpen] = useState(Platform.OS === 'ios')

  // Parsed with an explicit local-midnight time component (no 'Z' suffix) —
  // `new Date('YYYY-MM-DD')` alone is parsed as UTC midnight per spec, which
  // is exactly the footgun this component exists to avoid.
  const dateValue = new Date(`${value}T00:00:00`)

  function handleChange(_event: unknown, selected?: Date) {
    if (Platform.OS === 'android') setIsOpen(false)
    if (selected) onChange(localDateString(selected))
  }

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      {Platform.OS === 'android' && (
        <Pressable
          onPress={() => setIsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityValue={{ text: value }}
          className="rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 dark:border-border-dark dark:bg-surfaceMuted-dark"
        >
          <Text className="text-ink-light dark:text-ink-dark">{value}</Text>
        </Pressable>
      )}
      {/* Web: neither the iOS branch (isOpen defaults to false here — it's
          gated on Platform.OS === 'ios' above) nor the Android branch (its
          trigger Pressable is gated on Platform.OS === 'android') applies,
          and @react-native-community/datetimepicker itself has no web
          implementation — its platform-less fallback (src/datetimepicker.js)
          renders null and only warns "DateTimePicker is not supported on:
          web". So the picker never opened at all on web. Fixed with a real
          native `<input type="date">` — react-native-web/Metro's web bundle
          renders through react-dom, so this is an ordinary DOM element, not
          an RN host component; it already speaks this component's own
          YYYY-MM-DD convention natively (an `<input type="date">`'s
          value/onChange is exactly that string, no Date object round-trip,
          so this branch doesn't even touch the UTC-midnight footgun the
          header comment above warns about). Always rendered (no open/closed
          toggle needed) — the browser owns the trigger and the calendar
          popup itself. iOS/Android behavior above is untouched. */}
      {Platform.OS === 'web' && (
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid #d1d5db',
            fontSize: 16,
            fontFamily: 'inherit',
          }}
        />
      )}
      {isOpen && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={handleChange}
        />
      )}
    </View>
  )
}
