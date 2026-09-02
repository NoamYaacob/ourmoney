import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { useRTL } from '@/hooks/useRTL'

interface InputProps extends TextInputProps {
  label: string
  error?: string | null
}

export function Input({ label, error, className, ...textInputProps }: InputProps) {
  const { colorScheme: scheme } = useColorScheme()
  const { flip } = useRTL()
  const placeholderColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light

  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-start text-caption font-sansMedium text-inkMuted-light dark:text-inkMuted-dark">
        {label}
      </Text>
      <TextInput
        placeholderTextColor={placeholderColor}
        accessibilityLabel={label}
        // TextInput's textAlign has no start/end logical value — the one
        // case useRTL's own header comment calls out (RTL-flippable JS,
        // not a className). Hardcoding "right" here silently broke the
        // moment any screen using Input ever needed to run LTR.
        textAlign={flip('left', 'right')}
        className={
          className ??
          'rounded-control border border-border-light bg-surfaceMuted-light px-4 py-3 text-start text-ink-light web:desktop:py-3.5 dark:border-border-dark dark:bg-surfaceMuted-dark dark:text-ink-dark'
        }
        {...textInputProps}
      />
      {error && (
        <Text className="mt-1 text-start text-caption text-danger-light dark:text-danger-dark" accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  )
}
