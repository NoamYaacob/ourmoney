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
      {/* A plain flex-row, not flex-row-reverse — this app runs under a
          global forced-RTL flag (app/_layout.tsx), so the row already
          mirrors automatically: "₪" (first JSX child) lands on the visual
          right and the digits to its left, matching how formatILS's own
          Intl('he-IL') currency formatting already reads elsewhere in the
          app (symbol before the amount). */}
      <View className="flex-row items-center gap-1">
        <Text className="text-display font-bold text-ink-light dark:text-ink-dark">₪</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          className="min-w-[90px] text-display font-bold text-ink-light dark:text-ink-dark"
          style={{ textAlign: 'center' }}
        />
      </View>
    </View>
  )
}
