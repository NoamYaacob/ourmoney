// Extracted from the identical Pressable+ActivityIndicator block duplicated
// across every M3/M4 screen (sign-in, sign-up, forgot-password,
// create-household, invite-partner) — same classNames, same disabled/loading
// behavior, just copy-pasted per screen. This is the single source now.
//
// useColorScheme is imported from 'nativewind', NOT 'react-native' — on web,
// react-native-web's Appearance module only ever reflects the OS/browser
// preference and is never updated by NativeWind's colorScheme.set(), so
// reading RN's raw hook here would show the wrong tint whenever a user's
// explicit appearance override (features/settings/hooks/useTheme.ts) differs
// from their system setting (adversarial review finding — confirmed via a
// source-level trace of react-native-css-interop's web runtime). NativeWind's
// own hook is the one guaranteed to track colorScheme.set() on every platform.

import { ActivityIndicator, Pressable, Text } from 'react-native'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: ButtonVariant
  disabled?: boolean
  loading?: boolean
  selected?: boolean
}

const containerByVariant: Record<ButtonVariant, string> = {
  primary: 'items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100',
  secondary:
    'items-center rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 active:opacity-70 disabled:opacity-40 dark:border-border-dark dark:bg-surfaceMuted-dark',
  ghost: 'items-center px-4 py-3 active:opacity-70 disabled:opacity-40',
}

const textByVariant: Record<ButtonVariant, string> = {
  primary: 'font-semibold text-white dark:text-slate-900',
  secondary: 'font-semibold text-ink-light dark:text-ink-dark',
  ghost: 'text-sm font-semibold text-accent-light dark:text-accent-dark',
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  selected,
}: ButtonProps) {
  const { colorScheme: scheme } = useColorScheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
      className={containerByVariant[variant]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary'
              ? scheme === 'dark'
                ? colors.surface.dark
                : colors.surface.light
              : scheme === 'dark'
                ? colors.accent.dark
                : colors.accent.light
          }
        />
      ) : (
        <Text className={textByVariant[variant]}>{title}</Text>
      )}
    </Pressable>
  )
}
