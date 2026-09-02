// Shared "nothing here yet" UI — replaces the bare centered <Text> empty
// messages duplicated across every screen (Milestone 10 finding: every
// existing empty-state message was plain text with no icon or next action).
// Icon is decorative; the message text alone carries the semantic content
// for screen readers. actionLabel/onAction are optional since not every
// empty state has one natural next action from that exact screen (e.g. a
// filtered "no results" list has nothing to create from there).
//
// `OurMoney - Mobile.dc.html`'s "מצבים" frame draws this shape: a dashed
// border, a bare icon (no filled badge behind it), a short title, and a
// sentence saying what to do next. The dashed edge is the point — it reads
// as a space waiting to be filled rather than as a card that happens to be
// blank, which is what a solid border says.
//
// `hint` is that second line. Several callers already had the two halves and
// nowhere to put the second: Budgets held `noCategories` and
// `noCategoriesHint` and could only render one of them.
//
// `iconName` (an Ionicons glyph) is an alternative to the original `icon`
// emoji prop. `compact` is a smaller footprint for empty states embedded
// inside an already-scrolling section, so they don't each reserve a full
// chart-sized empty area.

import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
import { Button } from './Button'

interface EmptyStateProps {
  icon?: string
  iconName?: ComponentProps<typeof Ionicons>['name']
  /** The short title — "עדיין אין תנועות". */
  message: string
  /** What to do about it — "הוסיפו את הראשונה, או ייבאו קובץ מהבנק." */
  hint?: string
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}

export function EmptyState({ icon, iconName, message, hint, actionLabel, onAction, compact = false }: EmptyStateProps) {
  const { colorScheme: scheme } = useColorScheme()
  const glyphColor = scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light
  return (
    <View
      className={`items-center justify-center rounded-card border border-dashed border-border-light dark:border-border-dark ${
        compact ? 'gap-2 px-5 py-5' : 'gap-2.5 px-6 py-7'
      } web:desktop:mx-auto ${compact ? 'web:desktop:max-w-[360px]' : 'web:desktop:max-w-[420px]'}`}
    >
      {iconName ? (
        <Ionicons
          name={iconName}
          size={compact ? 20 : ICON.hero}
          color={glyphColor}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={compact ? 'text-xl' : 'text-2xl'}
        >
          {icon}
        </Text>
      )}
      <Text className="text-center text-bodySm font-sansSemibold text-ink-light dark:text-ink-dark">{message}</Text>
      {hint && (
        <Text className="text-center text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">{hint}</Text>
      )}
      {actionLabel && onAction && (
        <View className="mt-1 w-full max-w-xs">
          <Button title={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      )}
    </View>
  )
}
