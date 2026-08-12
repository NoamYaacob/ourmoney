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

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: ButtonVariant
  disabled?: boolean
  loading?: boolean
  selected?: boolean
  // Undefined (the default) means uncapped — every button's title scales
  // freely with the OS accessibility font-size setting, which is the
  // correct default and the whole point of respecting it. Only Modal.tsx
  // passes a value: it renders two Buttons side by side with no flex
  // constraint on either, so unbounded growth at iOS's largest
  // accessibility sizes (~310%) can overflow the dialog's fixed width.
  // This must NOT be hardcoded inside Button itself — every other caller
  // (every "Add X" CTA, form submits, delete-account) has a full-width,
  // unconstrained row to grow into and should not be capped (mobile-expo-
  // reviewer finding, Milestone 10: a hardcoded cap here silently applied
  // to every button title in the app, not just Modal's).
  maxFontSizeMultiplier?: number
}

const containerByVariant: Record<ButtonVariant, string> = {
  primary: 'items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-slate-100',
  secondary:
    'items-center rounded-xl border border-border-light bg-surfaceMuted-light px-4 py-3 active:opacity-70 disabled:opacity-40 dark:border-border-dark dark:bg-surfaceMuted-dark',
  ghost: 'items-center px-4 py-3 active:opacity-70 disabled:opacity-40',
  // Milestone 9: a full-weight destructive action (e.g. delete account) needs
  // stronger visual weight than categories.tsx's plain danger-colored Text —
  // a solid danger-colored button, same shape as primary.
  danger: 'items-center rounded-xl bg-danger-light px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-danger-dark',
}

const textByVariant: Record<ButtonVariant, string> = {
  primary: 'font-semibold text-white dark:text-slate-900',
  secondary: 'font-semibold text-ink-light dark:text-ink-dark',
  ghost: 'text-sm font-semibold text-accent-light dark:text-accent-dark',
  // danger.dark (#f87171) is a lighter red than danger.light — white text on
  // it computes to ~2.8:1 contrast, below WCAG AA's 4.5:1 floor (mobile
  // review finding, Milestone 9). Swaps to dark text in dark mode instead,
  // the exact same text-color-flip pattern primary already uses.
  danger: 'font-semibold text-white dark:text-slate-900',
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  selected,
  maxFontSizeMultiplier,
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
              : variant === 'danger'
                ? scheme === 'dark'
                  ? colors.ink.light
                  : colors.surface.light
                : scheme === 'dark'
                  ? colors.accent.dark
                  : colors.accent.light
          }
        />
      ) : (
        <Text className={textByVariant[variant]} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          {title}
        </Text>
      )}
    </Pressable>
  )
}
