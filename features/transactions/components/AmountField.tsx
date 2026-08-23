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
    // Desktop Visual/Responsive Design pass: trimmed vertical rhythm at
    // desktop only (mb-6/pb-5 -> mb-4/pb-3) — this stays the visually
    // dominant hero field (same text-display size, same centered symbol+
    // digits row), just without claiming as much of a now-wider form's
    // vertical space before the grouped fields below it. Mobile untouched.
    <View className="mb-6 items-center border-b border-border-light pb-5 web:desktop:mb-4 web:desktop:pb-3 dark:border-border-dark">
      <Text className="mb-1 text-caption text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      {/* The ₪ comes after the digits in source, which under RTL puts it on
          the physical left — where `formatILS` puts it in every other figure
          in the app, and where the design's own entry screen draws it. It
          had been first, so the one amount a household actually types was
          the one amount laid out differently from all the ones it reads
          back.

          The input keeps a min-width so a short or empty value still has a
          stable tap target, and right-aligns inside it so the digits stay
          flush against the symbol however many are typed — extra width grows
          away from it rather than around it. */}
      <View className="flex-row items-center gap-1">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          className="min-w-[90px] font-heebo text-heroXl text-ink-light dark:text-ink-dark"
          // The size is also set inline. react-native-web renders this as a
          // real <input>, and a browser's own input font-size wins over an
          // inherited one often enough that the field quietly rendered at
          // roughly half the tier it declared.
          style={{ textAlign: 'right', fontSize: 52, lineHeight: 58 }}
          maxFontSizeMultiplier={1.2}
        />
        <Text
          className="font-heebo text-heroXl text-ink-light dark:text-ink-dark"
          maxFontSizeMultiplier={1.2}
        >
          ₪
        </Text>
      </View>
    </View>
  )
}
