// Home's "לאן אנחנו מתקדמים" — Home has never shown goals before. Renders
// the same `useSavingsGoals` + `resolveGoalCurrentAgorot`/`goalProgressPercent`/
// `calculateSavingsPace`/`resolveGoalIsCompleted` the real `/goals` screen
// already uses (app/(app)/goals/index.tsx) — same functions, same
// `savings.pace.*` copy, so a goal cannot read as "behind" on Home and "on
// track" on Goals.
//
// The approved design-review artifact's headline hierarchy — one narrative
// percentage statement leading, the ₪ amounts secondary — is preserved.
// Its "time-elapsed-vs-money-saved" pace clock marker is deliberately NOT
// built: `calculateSavingsPace` has no start-date/elapsed-time concept at
// all (see that file's own header), the artifact's own copy flagged that
// exact marker "pending, awaiting start-date semantics" and never approved
// it for implementation, and this checkpoint's hard rule is no invented
// metrics — so only the real percent/amount/pace-sentence renders.

import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { goalProgressPercent, resolveGoalCurrentAgorot, resolveGoalIsCompleted } from '@/features/savings/lib/goalProgress'
import { calculateSavingsPace } from '@/lib/engines/savings/calculateSavingsPace'
import { formatDateDisplay } from '@/lib/dates/format'
import { formatILS } from '@/lib/money/format'
import { localDateString } from '@/features/budgets/lib/budgetPeriod'
import { StatusChip } from '@/components/ui/StatusChip'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { SavingsGoal } from '@/types/app'

// The approved artifact's own composition pairs goals two at a time
// (`goal-cols`) from tabletLg up — a household with one goal, or three,
// still gets that same treatment: pairs wrap, they don't force a 3rd empty
// column or squeeze a 3rd goal into the pair.
export function HomeGoalsSection({
  goals,
  balances,
}: {
  goals: SavingsGoal[]
  balances: Readonly<Record<string, number>>
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const today = localDateString()

  if (goals.length === 0) {
    return (
      <View className="items-center gap-2 px-4 py-6">
        <Text className="text-body font-heeboBold text-ink-light dark:text-ink-dark">{t('home.goals.empty')}</Text>
        <Text className="text-center text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {t('home.goals.emptyHint')}
        </Text>
        <Pressable
          onPress={() => router.push('/goals')}
          accessibilityRole="button"
          className="mt-1 rounded-control bg-accent-light px-4 py-2 dark:bg-accent-dark"
        >
          <Text className="text-caption font-sansSemibold text-surfaceMuted-light dark:text-surfaceMuted-dark">
            {t('home.goals.addGoal')}
          </Text>
        </Pressable>
      </View>
    )
  }

  const resolved = goals.map((goal) => ({
    goal,
    currentAgorot: resolveGoalCurrentAgorot(goal, balances),
    isCompleted: resolveGoalIsCompleted(goal, balances),
  }))
  const totalCurrentAgorot = resolved.reduce((sum, g) => sum + Math.min(g.currentAgorot, g.goal.target_agorot), 0)
  const totalTargetAgorot = resolved.reduce((sum, g) => sum + g.goal.target_agorot, 0)
  const aggregatePct = goalProgressPercent(totalCurrentAgorot, totalTargetAgorot) ?? 0

  return (
    <View>
      <View className="px-4 pt-1">
        <Text className="text-[26px] font-heeboBold text-accentStrong-light dark:text-accentStrong-dark" style={{ fontVariant: ['tabular-nums'] }}>
          {t('home.goals.headline', { pct: aggregatePct })}
        </Text>
        <Text className="mt-0.5 text-caption font-sans text-inkMuted-light dark:text-inkMuted-dark" style={{ fontVariant: ['tabular-nums'] }}>
          {t('savings.progressOf', { current: formatILS(totalCurrentAgorot), target: formatILS(totalTargetAgorot) })}
        </Text>
      </View>
      <View className="mx-4 mt-2">
        <ProgressBar percent={aggregatePct} positiveAtLimit />
      </View>

      <View className="mt-3 web:tabletLg:flex-row web:tabletLg:flex-wrap">
        {resolved.map(({ goal, currentAgorot, isCompleted }, index) => (
          <GoalRow key={goal.id} goal={goal} currentAgorot={currentAgorot} isCompleted={isCompleted} today={today} index={index} />
        ))}
      </View>

      <Pressable onPress={() => router.push('/goals')} accessibilityRole="button" className="items-center border-t border-divider-light py-3 dark:border-divider-dark">
        <Text className="text-caption font-sansSemibold text-accentStrong-light dark:text-accentStrong-dark">
          {t('home.goals.viewAll')}
        </Text>
      </Pressable>
    </View>
  )
}

function GoalRow({
  goal,
  currentAgorot,
  isCompleted,
  today,
  index,
}: {
  goal: SavingsGoal
  currentAgorot: number
  isCompleted: boolean
  today: string
  index: number
}) {
  const { t } = useTranslation()
  const router = useRouter()
  const percent = goalProgressPercent(currentAgorot, goal.target_agorot) ?? 0
  const pace = calculateSavingsPace({
    currentAgorot,
    targetAgorot: goal.target_agorot,
    targetDate: goal.target_date,
    today,
  })
  const isBehind = pace !== null && pace.remainingAgorot > 0 && !pace.isOnTrack

  return (
    <Pressable
      onPress={() => router.push(`/goals/${goal.id}`)}
      accessibilityRole="button"
      accessibilityLabel={goal.name}
      className={`gap-1.5 px-4 py-3 web:tabletLg:w-1/2 ${index > 0 ? 'border-t border-divider-light dark:border-divider-dark web:tabletLg:border-t-0' : ''} ${
        index % 2 === 1 ? 'web:tabletLg:border-s web:tabletLg:border-divider-light dark:web:tabletLg:border-divider-dark' : ''
      } ${index >= 2 ? 'web:tabletLg:border-t web:tabletLg:border-divider-light dark:web:tabletLg:border-divider-dark' : ''}`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-body font-sansSemibold text-ink-light dark:text-ink-dark" numberOfLines={1}>
          {goal.name}
        </Text>
        {isCompleted ? (
          <StatusChip label={t('savings.completed')} tone="positive" />
        ) : isBehind ? (
          <StatusChip label={t(pace?.isOverdue ? 'savings.pace.overdue' : 'savings.pace.behind')} tone="warning" />
        ) : (
          pace !== null && <StatusChip label={t('savings.pace.onTrack')} tone="positive" />
        )}
        <Text className="text-caption font-heeboBold text-ink-light dark:text-ink-dark" style={{ fontVariant: ['tabular-nums'] }}>
          {percent}%
        </Text>
      </View>
      <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
        {t('savings.progressOf', { current: formatILS(currentAgorot), target: formatILS(goal.target_agorot) })}
        {goal.target_date ? ` · ${t('savings.targetOn', { date: formatDateDisplay(goal.target_date) })}` : ''}
      </Text>
      <ProgressBar percent={percent} positiveAtLimit />
      {!isCompleted && (
        <Text className="text-meta font-sans text-inkMuted-light dark:text-inkMuted-dark">
          {pace === null
            ? t('savings.pace.noDateSentence', { amount: formatILS(Math.max(0, goal.target_agorot - currentAgorot)) })
            : pace.isOverdue
              ? t('savings.pace.behindSentence', { amount: formatILS(pace.remainingAgorot) })
              : t('savings.pace.onTrackSentence', {
                  amount: formatILS(pace.remainingAgorot),
                  monthly: formatILS(pace.requiredMonthlyAgorot),
                })}
        </Text>
      )}
    </Pressable>
  )
}
