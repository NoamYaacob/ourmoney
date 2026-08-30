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
//
// Two heads, one card. The phone frame (mobile screen 07) stacks: label,
// one figure, bar, then "הוצא X / מתוך Y" split across a line. The desktop
// frame has room to put all three figures side by side at 36/42 — נותר
// להוציא, הוצא, מתוך תקציב — with the projection lifted out of the foot and
// set beside them as a bordered note. Below the head the two are the same
// card, so only the head branches.

import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Money } from '@/components/ui/Money'
import { BudgetBar } from '@/components/ui/BudgetBar'
import { StatusChip } from '@/components/ui/StatusChip'
import { BUDGET_STATE_LABEL_KEY, BUDGET_STATE_TONE, type BudgetStateResult } from '@/features/budgets/lib/budgetState'
import { formatILS } from '@/lib/money/format'

export type BudgetSummaryVariant = 'stacked' | 'row'

interface BudgetSummaryCardProps {
  totalAllocatedAgorot: number
  totalSpentAgorot: number
  state: BudgetStateResult
  variant?: BudgetSummaryVariant
  testID?: string
}

export function BudgetSummaryCard({
  totalAllocatedAgorot,
  totalSpentAgorot,
  state,
  variant = 'stacked',
  testID,
}: BudgetSummaryCardProps) {
  const { t } = useTranslation()
  const remainingAgorot = totalAllocatedAgorot - totalSpentAgorot
  const tone = BUDGET_STATE_TONE[state.state]
  const isRow = variant === 'row'

  if (isRow) {
    return (
      <View
        testID={testID}
        className="rounded-card border border-border-light bg-surfaceMuted-light p-6 dark:border-border-dark dark:bg-surfaceMuted-dark"
      >
        <View className="flex-row items-start gap-9 border-b border-border-light pb-5 dark:border-border-dark">
          <View>
            <StatLabel>{t('budgets.summary.remainingLabel')}</StatLabel>
            {/* Checkpoint 7: this was the last screen still giving three
                figures equal weight (all `display`) — the exact "no
                hierarchy, only loud numbers" pattern Money.tsx's own header
                comment names, already corrected on Cash Flow (low point
                `figure`, the other two `large`). Remaining is the one figure
                a household is actually deciding against opening this screen
                (see this file's own header comment); spent/allocated are
                context for it, not co-equal headlines. */}
            <Money agorot={remainingAgorot} size="figure" tone={remainingAgorot < 0 ? 'danger' : 'default'} />
          </View>
          <View>
            <StatLabel>{t('budgets.summary.spentLabel')}</StatLabel>
            <Money agorot={totalSpentAgorot} size="large" tone="muted" />
          </View>
          <View>
            <StatLabel>{t('budgets.summary.allocatedLabel')}</StatLabel>
            <Money agorot={totalAllocatedAgorot} size="large" tone="muted" />
          </View>

          {state.hasProjection && (
            // A bordered note, not a red banner: being ahead of pace is an
            // observation the household can act on, not an error state.
            <View
              className={`ms-auto max-w-[250px] self-center rounded-e-row border-s-[3px] p-3 ${
                state.projectedOverspendAgorot > 0
                  ? 'border-s-warning-light bg-warningSurface-light dark:border-s-warning-dark dark:bg-warningSurface-dark'
                  : 'border-s-border-light bg-surface-light dark:border-s-border-dark dark:bg-surface-dark'
              }`}
            >
              <Text className="text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {state.projectedOverspendAgorot > 0
                  ? t('budgets.summary.projectionOver', { amount: formatILS(state.projectedOverspendAgorot) })
                  : t('budgets.summary.projectionOk')}
              </Text>
            </View>
          )}
        </View>

        {/* The bar's own legend, spelled out: the design frame explains each
            fill and the pace tick rather than leaving color to do it. */}
        <View className="mt-4 flex-row flex-wrap items-center gap-4">
          <StatusChip label={t(BUDGET_STATE_LABEL_KEY[state.state])} tone={tone} dot />
          {state.pacePercent !== null && (
            <View className="flex-row items-center gap-1.5">
              <View className="h-3 w-0.5 bg-ink-light dark:bg-ink-dark" />
              <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
                {t('budgets.summary.paceMarker')}
              </Text>
            </View>
          )}
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
      </View>
    )
  }

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

// The 12px tracked caption above every figure in the design's stat rows.
function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-meta font-sansSemibold tracking-[0.08em] text-inkMuted-light dark:text-inkMuted-dark">
      {children}
    </Text>
  )
}
