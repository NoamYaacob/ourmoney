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
      <Text className="mb-1.5 text-right text-sm font-medium text-inkMuted-light dark:text-inkMuted-dark">{label}</Text>
      <TextInput
        placeholderTextColor={placeholderColor}
        accessibilityLabel={label}
        textAlign="right"
        className={
          className ??
          'rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 text-right text-ink-light web:desktop:py-3.5 dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark'
        }
        {...textInputProps}
      />
      {error && (
        <Text className="mt-1 text-right text-sm text-danger-light dark:text-danger-dark" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  )
}
