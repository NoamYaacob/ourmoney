// One category's budget, as the design draws it: status before numbers.
//
// The row opens with a status dot and closes the header with a state chip,
// so a household scanning the list registers "which of these is in trouble"
// before reading a single figure. That ordering is the design's stated
// intent, and it is also what makes the list usable at a glance on a phone.
//
// Status is never carried by color alone — dot, chip wording, and a hatched
// fill on an overrun all say the same thing three ways (CLAUDE.md §
// accessibility, and the design system's own rule).

import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Ionicons } from '@expo/vector-icons'
import { useColorScheme } from 'nativewind'
import { colors } from '@/constants/colors'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { StatusChip, StatusDot } from '@/components/ui/StatusChip'
import { BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE, type BudgetStateResult } from '@/features/budgets/lib/budgetState'
import { formatILS } from '@/lib/money/format'
import type { BudgetCategoryProgress } from '@/types/app'

interface BudgetCategoryRowProps {
  category: BudgetCategoryProgress
  state: BudgetStateResult
  onPress: () => void
  testID?: string
}

export function BudgetCategoryRow({ category, state, onPress, testID }: BudgetCategoryRowProps) {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const tone = BUDGET_STATE_TONE[state.state]
  const isOver = category.remainingAgorot < 0

  // What the row says on its trailing line. An overrun states the overrun;
  // a category on course to overrun states the projection, which is the
  // whole point of showing a pace at all; otherwise it states what is left.
  const trailingText = isOver
    ? t('budgets.category.exceeded', { amount: formatILS(Math.abs(category.remainingAgorot)) })
    : state.state === 'approaching'
      ? t('budgets.category.projectedOver', { amount: formatILS(state.projectedOverspendAgorot) })
      : t('budgets.category.remaining', { amount: formatILS(category.remainingAgorot) })

  const trailingClass = isOver
    ? 'text-dangerStrong-light dark:text-dangerStrong-dark'
    : state.state === 'approaching'
      ? 'text-warningStrong-light dark:text-warningStrong-dark'
      : 'text-positiveStrong-light dark:text-positiveStrong-dark'

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category.categoryNameHe}, ${t(BUDGET_STATE_LABEL_KEY[state.state])}`}
      className="rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark"
    >
      <View className="flex-row items-center gap-2.5">
        <StatusDot tone={tone} />
        <CategoryIcon icon={category.categoryIcon} size="sm" />
        <Text className="flex-1 text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
          {category.categoryNameHe}
        </Text>
        <StatusChip label={t(BUDGET_STATE_LABEL_KEY[state.state])} tone={tone} />
        <Ionicons
          name="chevron-back"
          size={16}
          color={scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light}
        />
      </View>

      <View className="mt-2.5">
        <BudgetBar
          percent={state.percentSpent ?? 0}
          pacePercent={state.pacePercent}
          state={state.state}
          accessibilityLabel={`${category.categoryNameHe}, ${t(BUDGET_STATE_LABEL_KEY[state.state])}`}
        />
      </View>

      <View className="mt-2 flex-row items-baseline justify-between gap-3">
        <Text
          className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {t('budgets.category.spentOf', {
            spent: formatILS(category.spentAgorot),
            total: formatILS(category.allocatedAgorot),
          })}
        </Text>
        <Text className={`text-meta font-sans ${trailingClass}`} style={{ fontVariant: ['tabular-nums'] }}>
          {trailingText}
        </Text>
      </View>
    </Pressable>
  )
}
