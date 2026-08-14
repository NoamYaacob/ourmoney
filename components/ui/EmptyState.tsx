// Shared "nothing here yet" UI — replaces the bare centered <Text> empty
// messages duplicated across every screen (Milestone 10 finding: every
// existing empty-state message was plain text with no icon or next action).
// Icon is decorative; the message text alone carries the semantic content
// for screen readers. actionLabel/onAction are optional since not every
// empty state has one natural next action from that exact screen (e.g. a
// filtered "no results" list has nothing to create from there).
//
// Design Phase 2: `iconName` (an Ionicons glyph) is an additive alternative
// to the original `icon` emoji prop — existing callers that still pass
// `icon` (Budgets/Settings/Goals/Accounts/Recurring/Transactions, untouched
// this phase) render exactly as before; `iconName` only exists so Dashboard
// can move off emoji-as-iconography without changing anyone else. `compact`
// is likewise additive — a smaller footprint for empty states embedded
// inside an already-scrolling section (e.g. Dashboard's combined analytics
// empty state), so they don't each reserve a full chart-sized empty area.

import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: string
  iconName?: ComponentProps<typeof Ionicons>['name']
  message: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}

export function EmptyState({ icon, iconName, message, actionLabel, onAction, compact = false }: EmptyStateProps) {
  const { colorScheme: scheme } = useColorScheme()
  const glyphColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  // Desktop polish pass: `compact` empty states are embedded inside an
  // already-scrolling/bounded desktop panel or a dedicated desktop empty-
  // state card — a `web:desktop:` size bump keeps them from reading as a
  // shrunken mobile element inside a much roomier desktop container. Mobile
  // (unprefixed classes) is pixel-identical to before.
  const badgeSize = compact ? 'h-11 w-11 web:desktop:h-14 web:desktop:w-14' : 'h-16 w-16'

  return (
    <View
      className={
        compact
          ? 'items-center justify-center gap-2 px-6 py-4 web:desktop:gap-3 web:desktop:py-6'
          : 'items-center justify-center gap-3 px-6 py-8'
      }
    >
      <View className={`${badgeSize} items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark`}>
        {iconName ? (
          <Ionicons
            name={iconName}
            size={compact ? 20 : 26}
            color={glyphColor}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className={compact ? 'text-xl' : 'text-3xl'}
          >
            {icon}
          </Text>
        )}
      </View>
      <Text
        className={`text-center text-body text-inkMuted-light dark:text-inkMuted-dark ${compact ? 'web:desktop:text-[16px]' : ''}`}
      >
        {message}
      </Text>
      {actionLabel && onAction && (
        <View className="mt-1 w-full max-w-xs">
          <Button title={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      )}
    </View>
  )
}
