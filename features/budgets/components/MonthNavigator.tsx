// Design Phase 2: extracted from Dashboard's Phase 1 inline month-nav row so
// Budgets can adopt the identical component in a later phase instead of
// re-implementing it (Phase 1 had Dashboard and Budgets each drawing their
// own month row in a different style). Behavior is unchanged from Phase 1 —
// only the chevrons now carry a persistent background instead of an
// active-only one, since "barely visible until pressed" isn't enough to
// read as tappable at a glance.
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { useRTL } from '@/hooks/useRTL'
import { HIT_SLOP } from '@/constants/accessibility'
import { formatMonthLabel, shiftMonth } from '../lib/budgetPeriod'

interface MonthNavigatorProps {
  periodStart: string
  onChange: (periodStart: string) => void
}

export function MonthNavigator({ periodStart, onChange }: MonthNavigatorProps) {
  const { t } = useTranslation()
  const { flip } = useRTL()
  const { colorScheme: scheme } = useColorScheme()
  const iconColor = scheme === 'dark' ? colors.ink.dark : colors.ink.light

  return (
    <View className="mb-5 flex-row items-center justify-between">
      <Pressable
        onPress={() => onChange(shiftMonth(periodStart, -1))}
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.previousMonth')}
        hitSlop={HIT_SLOP}
        className="h-10 w-10 items-center justify-center rounded-full bg-surfaceMuted-light active:opacity-70 dark:bg-surfaceMuted-dark"
      >
        <Ionicons name={flip('chevron-back', 'chevron-forward')} size={20} color={iconColor} />
      </Pressable>
      <Text className="text-heading font-semibold text-ink-light dark:text-ink-dark">
        {formatMonthLabel(periodStart)}
      </Text>
      <Pressable
        onPress={() => onChange(shiftMonth(periodStart, 1))}
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.nextMonth')}
        hitSlop={HIT_SLOP}
        className="h-10 w-10 items-center justify-center rounded-full bg-surfaceMuted-light active:opacity-70 dark:bg-surfaceMuted-dark"
      >
        <Ionicons name={flip('chevron-forward', 'chevron-back')} size={20} color={iconColor} />
      </Pressable>
    </View>
  )
}
