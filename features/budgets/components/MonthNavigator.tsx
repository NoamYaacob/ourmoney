// The month being viewed, as a compact pill.
//
// `OurMoney - Mobile.dc.html` screen 07 draws this beside the screen title
// inside one 44px header row — a bordered pill holding [‹ אוגוסט ›] — not as
// a full-width bar of its own with the two chevrons pushed to opposite edges
// of the screen. The wide version put 300px of empty space between a control
// and its own label, and cost a whole row of vertical space above the card
// that actually answers the question.
//
// The chevrons keep their 44px touch targets via hitSlop: the pill is 34px
// tall (the design system's "secondary control in a row" height), and a
// visually smaller control is still a full-size target.
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { useTranslation } from 'react-i18next'
import { colors } from '@/constants/colors'
import { ICON } from '@/constants/icons'
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
    // Visual QA pass: verified directly (a throwaway route + real-browser
    // measurement), not assumed — global.css sets `direction: rtl` on
    // `html, body, #root`, and CSS flexbox's `row` axis runs along that
    // direction, so plain `flex-row` already places this component's
    // first-rendered child (the previous-month button) on the physical
    // right, matching native's Yoga-driven mirroring. `flex-row-reverse`
    // would flip it a second time, right back to a visually-LTR order —
    // confirmed by the same measurement. Older comments elsewhere in this
    // codebase recommending `web:flex-row` predate global.css's
    // `direction: rtl` (added specifically, per its own comment, "instead
    // of patching individual screens with row-reverse exceptions") and are
    // now stale; do not copy that pattern into new code without checking
    // global.css first.
    <View className="h-[34px] flex-row items-center gap-1 self-start rounded-control border border-border-light bg-surfaceMuted-light px-2 dark:border-border-dark dark:bg-surfaceMuted-dark">
      <Pressable
        onPress={() => onChange(shiftMonth(periodStart, -1))}
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.previousMonth')}
        hitSlop={HIT_SLOP}
        className="h-[34px] w-6 items-center justify-center active:opacity-70"
      >
        <Ionicons name={flip('chevron-back', 'chevron-forward')} size={ICON.chip} color={iconColor} />
      </Pressable>
      <Text className="text-caption font-sansSemibold text-ink-light dark:text-ink-dark">
        {formatMonthLabel(periodStart)}
      </Text>
      <Pressable
        onPress={() => onChange(shiftMonth(periodStart, 1))}
        accessibilityRole="button"
        accessibilityLabel={t('dashboard.nextMonth')}
        hitSlop={HIT_SLOP}
        className="h-[34px] w-6 items-center justify-center active:opacity-70"
      >
        <Ionicons name={flip('chevron-forward', 'chevron-back')} size={ICON.chip} color={iconColor} />
      </Pressable>
    </View>
  )
}
