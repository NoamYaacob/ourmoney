// Desktop polish pass: shared header row for the bounded desktop panels
// used across Dashboard and Budgets (icon chip + title on the near/right
// side, an optional action on the far/left side, both reversed via
// `web:flex-row` for RTL — see _layout.tsx's DesktopSideRail
// comment for why `web:` reversal is needed at all). Matches every other
// two-region desktop split in this app (Dashboard's analytics grid,
// Budgets'/Categories' column splits, Settings' two-column split) — none of
// them are plain, unreversed `flex-row`; see this app's shared regression
// tests for why that distinction is asserted with exact-token matching, not
// a `.toContain()` substring check that can't tell the two apart. Extracted
// once both screens needed the identical markup, rather than duplicated
// per file.
import type { ComponentProps, ReactNode } from 'react'
import { Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'

interface DesktopPanelHeaderProps {
  icon: ComponentProps<typeof Ionicons>['name']
  title: string
  action?: ReactNode
}

export function DesktopPanelHeader({ icon, title, action }: DesktopPanelHeaderProps) {
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.accent.dark : colors.accent.light

  return (
    <View className="mb-2 mt-6 web:desktop:mt-0 flex-row items-center justify-between web:flex-row">
      <View className="flex-row items-center gap-2 web:flex-row">
        <View className="hidden h-7 w-7 items-center justify-center rounded-full bg-accent-light/10 web:desktop:flex dark:bg-accent-dark/10">
          <Ionicons name={icon} size={ICON.chip} color={iconColor} />
        </View>
        <Text className="text-heading font-semibold text-inkMuted-light dark:text-inkMuted-dark">{title}</Text>
      </View>
      {action}
    </View>
  )
}
