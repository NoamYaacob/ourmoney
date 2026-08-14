// Desktop polish pass: shared header row for the bounded desktop panels
// used across Dashboard and Budgets (icon chip + title on the near/right
// side, an optional action on the far/left side, both reversed via
// `web:flex-row-reverse` for RTL — see _layout.tsx's DesktopSideRail
// comment for why `web:` reversal is needed at all). Extracted once both
// screens needed the identical markup, rather than duplicated per file.
import type { ComponentProps, ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'

interface DesktopPanelHeaderProps {
  icon: ComponentProps<typeof Ionicons>['name']
  title: string
  action?: ReactNode
}

export function DesktopPanelHeader({ icon, title, action }: DesktopPanelHeaderProps) {
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light

  return (
    <View className="mb-2 mt-6 web:desktop:mt-0 flex-row items-center justify-between web:flex-row-reverse">
      <View className="flex-row items-center gap-2 web:flex-row-reverse">
        <View className="hidden h-7 w-7 items-center justify-center rounded-full bg-accent-light/10 web:desktop:flex dark:bg-accent-dark/10">
          <Ionicons name={icon} size={14} color={iconColor} />
        </View>
        <Text className="text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">{title}</Text>
      </View>
      {action}
    </View>
  )
}
