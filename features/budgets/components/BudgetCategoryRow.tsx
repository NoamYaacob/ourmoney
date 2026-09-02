// One category's budget, as the design draws it: status before numbers.
//
// Two compositions, because the two design files draw two. `card` is
// `OurMoney - Mobile.dc.html` screen 07: a bordered card per category, with
// the ratio and the projection split across the row's foot, and a chevron
// into the category's own screen. `plain` is the desktop Budget frame: no
// card chrome at all, the ratio pulled up onto the name line at the end
// edge, the projection as a full-width line beneath, and no chevron —
// desktop opens the allocation editor inline instead of navigating.
// Everything else — the status dot, the emoji tile, the state chip, the
// pace-marked bar — is shared, which is what the design system's own note
// on this row ("זהה מבנית") asks for.
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
import { ICON } from '@/constants/icons'
import { CategoryIcon } from '@/features/categories/components/CategoryIcon'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { StatusChip, StatusDot } from '@/components/ui/StatusChip'
import { BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE, type BudgetStateResult } from '@/features/budgets/lib/budgetState'
import { HIT_SLOP } from '@/constants/accessibility'
import { formatILS, formatRatioILS } from '@/lib/money/format'
import type { BudgetCategoryProgress } from '@/types/app'

export type BudgetCategoryRowVariant = 'card' | 'plain'

interface BudgetCategoryRowProps {
  category: BudgetCategoryProgress
  state: BudgetStateResult
  onPress: () => void
  /** Opens the category's own screen. Its chevron becomes the target; the
      row itself keeps whatever `onPress` does. Omitted where no such screen
      exists (the desktop frame edits inline and has no category screen), and
      the chevron is then not drawn at all. */
  onOpenDetail?: () => void
  variant?: BudgetCategoryRowVariant
  testID?: string
}

export function BudgetCategoryRow({
  category,
  state,
  onPress,
  onOpenDetail,
  variant = 'card',
  testID,
}: BudgetCategoryRowProps) {
  const { t } = useTranslation()
  const { colorScheme: scheme } = useColorScheme()
  const tone = BUDGET_STATE_TONE[state.state]
  const isOver = category.remainingAgorot < 0
  const isPlain = variant === 'plain'

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

  const rowLabel = `${category.categoryNameHe}, ${t(BUDGET_STATE_LABEL_KEY[state.state])}`
  const cardClassName = isPlain
    ? ''
    : 'rounded-card border border-border-light bg-surfaceMuted-light p-4 dark:border-border-dark dark:bg-surfaceMuted-dark'

  const content = (
    <>
      <View className="flex-row items-baseline gap-2.5">
        <StatusDot tone={tone} />
        <CategoryIcon icon={category.categoryIcon} size="sm" />
        <Text className="text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
          {category.categoryNameHe}
        </Text>
        <StatusChip label={t(BUDGET_STATE_LABEL_KEY[state.state])} tone={tone} />
        {isPlain ? (
          // The ratio rides the name line at the end edge — bare numbers
          // with a slash, the design system's `ratio` style (§08). The
          // currency is on the total alone; repeating ₪ twice in one
          // fraction is noise.
          <Text
            className={`ms-auto text-caption font-sans ${
              isOver ? 'font-sansSemibold text-dangerStrong-light dark:text-dangerStrong-dark' : 'text-inkMuted-light dark:text-inkMuted-dark'
            }`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatRatioILS(category.spentAgorot, category.allocatedAgorot)}
          </Text>
        ) : (
          <View className="flex-1" />
        )}
      </View>

      <View className="mt-2.5">
        <BudgetBar
          percent={state.percentSpent ?? 0}
          pacePercent={state.pacePercent}
          state={state.state}
          height={isPlain ? 10 : 8}
          accessibilityLabel={rowLabel}
        />
      </View>

      {isPlain ? (
        <Text className={`mt-1.5 text-meta font-sans ${trailingClass}`} style={{ fontVariant: ['tabular-nums'] }}>
          {trailingText}
        </Text>
      ) : (
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
      )}
    </>
  )

  if (isPlain) {
    return (
      <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={rowLabel} className={cardClassName}>
        {content}
      </Pressable>
    )
  }

  // Checkpoint 7 fix: the chevron used to be a second Pressable nested
  // inside this row's own Pressable — on web that compiles to a <button>
  // nested inside a <button>, which is invalid HTML, throws a real React
  // hydration warning, and leaves keyboard/screen-reader focus behavior
  // undefined for whichever control sits inside. The two are genuinely
  // different actions (open the amount editor vs. open the category's own
  // transactions), so both still need to be independently tappable — just
  // as siblings, never one inside the other. Visual result and both tap
  // targets are unchanged; only the DOM/accessibility-tree nesting is.
  return (
    <View testID={testID} className={`flex-row items-start gap-1 ${cardClassName}`}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={rowLabel} className="flex-1">
        {content}
      </Pressable>
      {onOpenDetail && (
        <Pressable
          onPress={onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel={`${category.categoryNameHe}, ${t('budgets.category.detailTransactions')}`}
          hitSlop={HIT_SLOP}
          className="h-6 w-6 items-center justify-center"
        >
          <Ionicons
            name="chevron-back"
            size={ICON.row}
            color={scheme === 'dark' ? colors.inkMuted.dark : colors.inkMuted.light}
          />
        </Pressable>
      )}
    </View>
  )
}
