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
  // Defaults to `title` (every existing caller's exact prior behavior,
  // unchanged) — pass explicitly when several identically-titled buttons
  // render adjacently (e.g. one "הסרה" per household member) so a screen
  // reader announces which one, not just the shared generic label
  // (UX-completeness audit finding).
  accessibilityLabel?: string
}

// Design Phase 1: primary moved from a raw bg-slate-900/100 (no relation to
// the token system) to the brand accent — this is the one place the app's
// single confident brand color should show up as a filled surface, not just
// text/icons. rounded-control is the new shared radius token for pressable/
// input-sized elements (see tailwind.config.js).
const containerByVariant: Record<ButtonVariant, string> = {
  primary: 'items-center rounded-control bg-accent-light px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-accent-dark',
  secondary:
    'items-center rounded-control border border-border-light bg-surfaceMuted-light px-4 py-3 active:opacity-70 disabled:opacity-40 dark:border-border-dark dark:bg-surfaceMuted-dark',
  ghost: 'items-center rounded-control px-4 py-3 active:opacity-70 disabled:opacity-40',
  // Milestone 9: a full-weight destructive action (e.g. delete account) needs
  // stronger visual weight than categories.tsx's plain danger-colored Text —
  // a solid danger-colored button, same shape as primary.
  danger: 'items-center rounded-control bg-danger-light px-4 py-3 active:opacity-70 disabled:opacity-40 dark:bg-danger-dark',
}

const textByVariant: Record<ButtonVariant, string> = {
  // accent.dark (#4fc9a8) is a bright teal, not a dark fill — white text on
  // it would fail contrast, so dark mode flips to ink-toned text instead
  // (script-verified 8.1:1, see constants/colors.ts's own audit).
  primary: 'font-semibold text-white dark:text-ink-light',
  secondary: 'font-semibold text-ink-light dark:text-ink-dark',
  ghost: 'text-sm font-semibold text-accent-light dark:text-accent-dark',
  // danger.dark is a lighter red than danger.light — white text on it fails
  // WCAG AA (mobile review finding, Milestone 9). Swaps to dark ink-toned
  // text in dark mode instead, the same flip primary uses.
  danger: 'font-semibold text-white dark:text-ink-light',
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  selected,
  maxFontSizeMultiplier,
  accessibilityLabel,
}: ButtonProps) {
  const { colorScheme: scheme } = useColorScheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading, selected }}
      className={containerByVariant[variant]}
    >
      {loading ? (
        <ActivityIndicator
          // Mirrors textByVariant: primary/danger fills are solid color, so
          // the spinner is white in light mode and flips to ink.light in
          // dark mode (same accent.dark/danger.dark contrast fix as the
          // text). secondary/ghost have no filled background, so the
          // spinner stays accent-colored regardless of variant.
          color={
            variant === 'primary' || variant === 'danger'
              ? scheme === 'dark'
                ? colors.ink.light
                : '#ffffff'
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
