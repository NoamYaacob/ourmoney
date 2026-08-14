// Design Phase 2: amount is the single most important input on this form —
// previously it looked identical to every other text field. This is a
// dedicated, oversized entry area; it only renders the value and forwards
// onChangeText, so agorotFromILS parsing/validation in the parent screen is
// completely unchanged (this component never touches money arithmetic).
import { Text, TextInput, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

interface AmountFieldProps {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder: string
}

export function AmountField({ label, value, onChangeText, placeholder }: AmountFieldProps) {
  const { colorScheme: scheme } = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    <View className="mb-6 items-center border-b border-border-light pb-5 dark:border-border-dark">
      <Text className="mb-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      {/* Native Yoga auto-mirrors flex-row under the forced-RTL flag
          (app/_layout.tsx), so "₪" (first JSX child) already lands on the
          visual right there. NativeWind's web-compiled CSS does not consult
          that flag (no dir="rtl" on the web document), so web needs an
          explicit web:flex-row-reverse to get the same result — DOM order
          (and screen-reader order) is unchanged, only the web visual
          position flips. Matches formatILS's own Intl('he-IL') currency
          formatting (symbol before the amount).
          Phase 3.1: the TextInput keeps a min-width so short/empty values
          still have a comfortable, stable tap target, but its text is
          right-aligned (not centered) within that box — center-aligning a
          short value inside a wide fixed box left visible dead air between
          "₪" and the first digit. Right-aligning pins the digits flush
          against the symbol regardless of how many are typed, with any
          extra width growing away from it (left) instead of around it. */}
      <View className="flex-row items-center gap-1 web:flex-row-reverse">
        <Text className="text-display font-bold text-ink-light dark:text-ink-dark">₪</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          className="min-w-[90px] text-display font-bold text-ink-light dark:text-ink-dark"
          style={{ textAlign: 'right' }}
        />
      </View>
    </View>
  )
}
