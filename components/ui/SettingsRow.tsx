// Design Phase 3: replaces Settings' stack of full-width secondary Buttons
// (one bordered rectangle per action) with a row shape that groups several
// related actions inside one SettingsSection Card instead — icon, label,
// optional secondary value/status, and either a navigation chevron or a
// caller-supplied trailing control (e.g. a Switch).
import type { ComponentProps, ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { useRTL } from '@/hooks/useRTL'

interface SettingsRowProps {
  iconName: ComponentProps<typeof Ionicons>['name']
  label: string
  value?: string
  onPress?: () => void
  // Overrides the default navigation chevron — for a row whose primary
  // control isn't "navigate on tap" (Security's biometric Switch).
  trailing?: ReactNode
  destructive?: boolean
  disabled?: boolean
}

export function SettingsRow({ iconName, label, value, onPress, trailing, destructive = false, disabled = false }: SettingsRowProps) {
  const { colorScheme: scheme } = useColorScheme()
  const { flip } = useRTL()
  const mutedColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  const iconColor = destructive
    ? scheme === 'dark'
      ? colors.danger.dark
      : colors.danger.light
    : scheme === 'dark'
      ? colors.ink.dark
      : colors.ink.light
  const labelClassName = destructive
    ? 'flex-1 text-body text-danger-light dark:text-danger-dark'
    : 'flex-1 text-body text-ink-light dark:text-ink-dark'

  const content = (
    <View className="flex-row items-center gap-3 py-3">
      <View className="h-9 w-9 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>
      <Text className={labelClassName}>{label}</Text>
      {value && <Text className="text-caption text-inkMuted-light dark:text-inkMuted-dark">{value}</Text>}
      {trailing ?? (onPress && <Ionicons name={flip('chevron-forward', 'chevron-back')} size={18} color={mutedColor} />)}
    </View>
  )

  if (!onPress) return content

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      className="active:opacity-70"
    >
      {content}
    </Pressable>
  )
}
