// Extracted from the identical label+TextInput block duplicated across every
// M3/M4 form screen. RTL-safe: no hardcoded left/right, text follows the
// platform's natural start/end via I18nManager (already forced globally).
//
// useColorScheme is imported from 'nativewind', NOT 'react-native' — see
// components/ui/Button.tsx's header comment for why (adversarial review
// finding: RN's raw hook can diverge from an explicit appearance override
// on web).

import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

interface InputProps extends TextInputProps {
  label: string
  error?: string | null
}

export function Input({ label, error, className, ...textInputProps }: InputProps) {
  const { colorScheme: scheme } = useColorScheme()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      <TextInput
        placeholderTextColor={placeholderColor}
        accessibilityLabel={label}
        className={
          className ??
          'rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-ink-light dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark'
        }
        {...textInputProps}
      />
      {error && (
        <Text className="mt-1 text-sm text-danger-light dark:text-danger-dark" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  )
}
