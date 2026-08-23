// The month's budget in one card.
//
// The hero figure is what is LEFT, not what was allocated. The design made
// that swap deliberately: "you planned ₪8,700" is a fact about a decision
// already taken, while "₪1,690 left" is the thing a household is actually
// deciding against when it opens the screen. The allocation still appears,
// as the denominator it is.
//
// The pace marker on the bar gets a one-line legend. A dark tick inside a
// progress bar means nothing on first sight, and the sentence is cheaper
// than leaving the household to work it out.

import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Money } from '@/components/ui/Money'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { StatusChip } from '@/components/ui/StatusChip'
import { BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE, type BudgetStateResult } from '@/features/budgets/lib/budgetState'
import { formatILS } from '@/lib/money/format'

interface BudgetSummaryCardProps {
  totalAllocatedAgorot: number
  totalSpentAgorot: number
  state: BudgetStateResult
  testID?: string
}

export function BudgetSummaryCard({
  totalAllocatedAgorot,
  totalSpentAgorot,
  state,
  testID,
}: BudgetSummaryCardProps) {
  const { t } = useTranslation()
  const remainingAgorot = totalAllocatedAgorot - totalSpentAgorot
  const tone = BUDGET_STATE_TONE[state.state]

  return (
    <View
      testID={testID}
      className="rounded-card border border-border-light bg-surfaceMuted-light p-5 dark:border-border-dark dark:bg-surfaceMuted-dark"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-meta font-sansSemibold tracking-[0.06em] text-inkMuted-light dark:text-inkMuted-dark">
          {t('budgets.summary.remainingLabel')}
        </Text>
        <StatusChip label={t(BUDGET_STATE_LABEL_KEY[state.state])} tone={tone} dot />
      </View>

      <View className="mt-0.5">
        <Money agorot={remainingAgorot} size="display" tone={remainingAgorot < 0 ? 'danger' : 'default'} />
      </View>

      <View className="mt-3">
        <BudgetBar
          percent={state.percentSpent ?? 0}
          pacePercent={state.pacePercent}
          state={state.state}
          height={10}
          accessibilityLabel={t(BUDGET_STATE_LABEL_KEY[state.state])}
        />
      </View>

      <Text
        className="mt-2.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {t('budgets.summary.spentOf', {
          spent: formatILS(totalSpentAgorot),
          total: formatILS(totalAllocatedAgorot),
        })}
      </Text>

      {state.hasProjection && (
        <View className="mt-3 border-t border-divider-light pt-3 dark:border-divider-dark">
          <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
            {state.projectedOverspendAgorot > 0
              ? t('budgets.summary.projectionOver', { amount: formatILS(state.projectedOverspendAgorot) })
              : t('budgets.summary.projectionOk')}
          </Text>
          {state.pacePercent !== null && (
            <Text className="mt-1 text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
              {t('budgets.summary.paceMarker')}
            </Text>
          )}
        </View>
      )}
    </View>
  )
}
