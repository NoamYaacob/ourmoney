// Shared "nothing here yet" UI — replaces the bare centered <Text> empty
// messages duplicated across every screen (Milestone 10 finding: every
// existing empty-state message was plain text with no icon or next action).
// Icon is decorative (matches the app's existing emoji-icon convention for
// categories); the message text alone carries the semantic content for
// screen readers. actionLabel/onAction are optional since not every empty
// state has one natural next action from that exact screen (e.g. a
// filtered "no results" list has nothing to create from there).

import { Text, View } from 'react-native'
import { Button } from './Button'

interface EmptyStateProps {
  icon: string
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="items-center justify-center gap-3 px-6 py-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-surfaceMuted-light dark:bg-surfaceMuted-dark">
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="text-3xl"
        >
          {icon}
        </Text>
      </View>
      <Text className="text-center text-body text-inkMuted-light dark:text-inkMuted-dark">{message}</Text>
      {actionLabel && onAction && (
        <View className="mt-1 w-full max-w-xs">
          <Button title={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      )}
    </View>
  )
}
